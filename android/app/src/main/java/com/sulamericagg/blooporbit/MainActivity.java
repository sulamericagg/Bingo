package com.sulamericagg.blooporbit;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BloopOrientationPlugin.class);
        registerPlugin(BloopDevicePlugin.class);
        super.onCreate(savedInstanceState);
        // Jogo: a tela nunca apaga sozinha enquanto o app está aberto.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
}
