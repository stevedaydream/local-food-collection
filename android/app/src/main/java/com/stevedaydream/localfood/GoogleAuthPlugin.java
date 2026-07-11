package com.stevedaydream.localfood;

import android.app.Activity;
import android.content.Context;

import androidx.activity.result.ActivityResult;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialException;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.Scope;
import com.google.android.libraries.identity.googleid.GetGoogleIdOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

import java.util.Collections;
import java.util.concurrent.Executors;

/**
 * 原生 Google 授權：WebView 內不能跑 Google OAuth（disallowed_useragent），
 * 改用 Play Services 的 AuthorizationClient 原生流程取 access token 再傳回 Web 端
 * （lib/google-drive.ts 偵測到殼內就走這條）。
 * 需在 Google Cloud Console 註冊「Android」OAuth client（package name + SHA-1）。
 */
@CapacitorPlugin(name = "GoogleAuth")
public class GoogleAuthPlugin extends Plugin {

    private static final String DRIVE_APPDATA = "https://www.googleapis.com/auth/drive.appdata";

    private static PluginCall pendingCall = null;
    private static Context appContext = null;

    @Override
    public void load() {
        appContext = getContext().getApplicationContext();
    }

    @PluginMethod
    public void getAccessToken(PluginCall call) {
        AuthorizationRequest request = AuthorizationRequest.builder()
                .setRequestedScopes(Collections.singletonList(new Scope(DRIVE_APPDATA)))
                .build();
        Identity.getAuthorizationClient(getActivity())
                .authorize(request)
                .addOnSuccessListener(result -> {
                    if (result.hasResolution() && result.getPendingIntent() != null) {
                        // 需要使用者同意 → 開原生授權畫面，結果回到 onAuthResult
                        pendingCall = call;
                        ((MainActivity) getActivity())
                                .launchGoogleAuth(result.getPendingIntent().getIntentSender());
                    } else {
                        resolveWithToken(call, result);
                    }
                })
                .addOnFailureListener(e -> call.reject("Google 授權失敗：" + e.getMessage()));
    }

    /**
     * 登入用：Credential Manager 原生流程取 Google ID token（Supabase signInWithIdToken 用）。
     * clientId 需傳「Web」OAuth client ID（token audience），Android client 靠 package+SHA-1 比對。
     */
    @PluginMethod
    public void getIdToken(PluginCall call) {
        String clientId = call.getString("clientId");
        if (clientId == null || clientId.isEmpty()) {
            call.reject("missing clientId");
            return;
        }
        GetGoogleIdOption option = new GetGoogleIdOption.Builder()
                .setServerClientId(clientId)
                .setFilterByAuthorizedAccounts(false)
                .build();
        GetCredentialRequest request = new GetCredentialRequest.Builder()
                .addCredentialOption(option)
                .build();
        CredentialManager.create(getContext()).getCredentialAsync(
                getActivity(),
                request,
                null,
                Executors.newSingleThreadExecutor(),
                new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                    @Override
                    public void onResult(GetCredentialResponse response) {
                        Credential cred = response.getCredential();
                        if (cred instanceof CustomCredential
                                && GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
                                        .equals(cred.getType())) {
                            GoogleIdTokenCredential google =
                                    GoogleIdTokenCredential.createFrom(((CustomCredential) cred).getData());
                            JSObject ret = new JSObject();
                            ret.put("idToken", google.getIdToken());
                            call.resolve(ret);
                        } else {
                            call.reject("Google 沒有回傳身分憑證");
                        }
                    }

                    @Override
                    public void onError(GetCredentialException e) {
                        call.reject("Google 登入失敗：" + e.getMessage());
                    }
                });
    }

    /** MainActivity 的 ActivityResultLauncher 回呼 */
    static void onAuthResult(ActivityResult result) {
        PluginCall call = pendingCall;
        pendingCall = null;
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("登入視窗被關閉");
            return;
        }
        try {
            AuthorizationResult auth = Identity.getAuthorizationClient(appContext)
                    .getAuthorizationResultFromIntent(result.getData());
            resolveWithToken(call, auth);
        } catch (Exception e) {
            call.reject("Google 授權失敗：" + e.getMessage());
        }
    }

    private static void resolveWithToken(PluginCall call, AuthorizationResult result) {
        String token = result.getAccessToken();
        if (token == null || token.isEmpty()) {
            call.reject("Google 沒有回傳 access token");
            return;
        }
        JSObject ret = new JSObject();
        ret.put("accessToken", token);
        call.resolve(ret);
    }
}
