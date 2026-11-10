package com.sulamericagg.blooporbit;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Orientação controlada direto pela Activity (sem depender de plugin de terceiros).
 * mode: "portrait" | "landscape" (qualquer lado deitado, segue o sensor) | "sensor" (livre).
 */
@CapacitorPlugin(name = "BloopOrientation")
public class BloopOrientationPlugin extends Plugin {

    @PluginMethod
    public void set(PluginCall call) {
        final String mode = call.getString("mode", "portrait");
        final Activity act = getActivity();
        if (act == null) {
            call.reject("no activity");
            return;
        }
        act.runOnUiThread(() -> {
            int o;
            switch (mode) {
                case "landscape":
                    o = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE;
                    break;
                case "sensor":
                    o = ActivityInfo.SCREEN_ORIENTATION_FULL_USER;
                    break;
                default:
                    o = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT;
            }
            act.setRequestedOrientation(o);
            JSObject ret = new JSObject();
            ret.put("requested", o);
            ret.put("current", act.getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE ? "landscape" : "portrait");
            call.resolve(ret);
        });
    }
}
