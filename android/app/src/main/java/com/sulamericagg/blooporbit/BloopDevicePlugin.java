package com.sulamericagg.blooporbit;

import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import android.content.pm.ConfigurationInfo;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Perfil de hardware para escolher o nivel grafico (src/core/device.ts).
 * So dados do aparelho (modelo, RAM, GPU/GLES, SDK): nada pessoal, nenhuma permissao.
 * openSettings(): abre a tela do app nos Ajustes (liberar o microfone negado no Cava & Fala).
 */
@CapacitorPlugin(name = "BloopDevice")
public class BloopDevicePlugin extends Plugin {

    @PluginMethod
    public void info(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("model", Build.MODEL);
        ret.put("manufacturer", Build.MANUFACTURER);
        ret.put("brand", Build.BRAND);
        ret.put("hardware", Build.HARDWARE);
        ret.put("sdk", Build.VERSION.SDK_INT);
        ret.put("release", Build.VERSION.RELEASE);
        ret.put("cores", Runtime.getRuntime().availableProcessors());
        if (Build.VERSION.SDK_INT >= 31) {
            ret.put("soc", Build.SOC_MODEL);
            ret.put("socManufacturer", Build.SOC_MANUFACTURER);
        }
        try {
            ActivityManager am = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
            if (am != null) {
                ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
                am.getMemoryInfo(mi);
                ret.put("totalMem", mi.totalMem);
                ret.put("lowRam", am.isLowRamDevice());
                ret.put("memoryClass", am.getMemoryClass());
                ConfigurationInfo ci = am.getDeviceConfigurationInfo();
                if (ci != null) ret.put("glEs", ci.getGlEsVersion());
            }
        } catch (Exception e) {
            ret.put("err", String.valueOf(e.getMessage()));
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            i.setData(Uri.fromParts("package", getContext().getPackageName(), null));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }
}
