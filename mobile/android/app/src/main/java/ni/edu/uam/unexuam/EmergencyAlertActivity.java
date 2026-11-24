package ni.edu.uam.unexuam;

import android.annotation.SuppressLint;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.media.ToneGenerator;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.NotificationManagerCompat;
import java.io.InputStream;

public class EmergencyAlertActivity extends AppCompatActivity {
    public static final String EXTRA_TIPO = "tipo";
    public static final String EXTRA_TITULO = "titulo";
    public static final String EXTRA_TEXTO = "texto";
    public static final int NOTIF_ALARMA_ID = 9110;

    private static volatile EmergencyAlertActivity instanciaActiva = null;

    private MediaPlayer mediaPlayer;
    private ToneGenerator toneGen;
    private Handler sirenaHandler;
    private Runnable sirenaRunnable;
    private Vibrator vibrator;
    private boolean alarmaActiva = false;

    public static void detenerSiActiva() {
        EmergencyAlertActivity act = instanciaActiva;
        if (act != null) {
            act.runOnUiThread(() -> {
                act.detenerAlarma();
                act.finish();
            });
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        instanciaActiva = this;
        configurarPantallaBloqueo();
        construirUI(getIntent());
        iniciarAlarma();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        construirUI(intent);
        if (!alarmaActiva) iniciarAlarma();
    }

    @SuppressWarnings("deprecation")
    private void configurarPantallaBloqueo() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }
        getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                        | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                        | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                        | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
    }

    private int dp(int v) {
        return Math.round(TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    private GradientDrawable pill(int colorBg, int radioDp) {
        GradientDrawable gd = new GradientDrawable();
        gd.setColor(colorBg);
        gd.setCornerRadius(dp(radioDp));
        return gd;
    }

    private void construirUI(Intent intent) {
        String tipo = intent != null && intent.getStringExtra(EXTRA_TIPO) != null
                ? intent.getStringExtra(EXTRA_TIPO).toLowerCase() : "general";
        String titulo = intent != null && intent.getStringExtra(EXTRA_TITULO) != null
                ? intent.getStringExtra(EXTRA_TITULO) : "Emergencia en el campus UAM";
        String texto = intent != null && intent.getStringExtra(EXTRA_TEXTO) != null
                ? intent.getStringExtra(EXTRA_TEXTO) : "Sigue tu ruta de evacuación hacia el punto seguro más cercano.";

        int colorFondo = Color.parseColor("#B01E00");
        int colorTexto = Color.WHITE;
        int colorDesc = Color.parseColor("#F5F9FF");
        int colorBadgeBg = Color.parseColor("#FCD222");
        int colorBadgeTxt = Color.parseColor("#0B2A4A");
        int colorPasoBg = Color.parseColor("#2B000000");
        int colorNumBg = Color.parseColor("#FCD222");
        int colorNumTxt = Color.parseColor("#0B2A4A");
        int colorBtnBg = Color.WHITE;
        int colorBtnTxt = Color.parseColor("#B01E00");
        int colorSecBg = Color.parseColor("#33FFFFFF");
        int colorSecBorde = Color.WHITE;
        String assetImg = "public/static/img/ico-fuego.png";
        String badgeTxt = "EMERGENCIA ACTIVA · UNEXUAM";
        String paso1 = "Mantén la calma y sigue tu ruta más corta hacia el punto seguro.";
        String paso2 = "Reporta bloqueos o pide ayuda en el Canal General sin internet.";

        if ("incendio".equals(tipo)) {
            colorFondo = Color.parseColor("#C42400");
            colorBtnTxt = colorFondo;
            assetImg = "public/static/img/figma/tarjeta-incendio.jpg";
            badgeTxt = "ALERTA DE INCENDIO · UNEXUAM";
            paso1 = "Evacúa rápido y agachado si hay humo. No uses elevadores.";
            paso2 = "Ve hacia Plazoleta o Canchas y no regreses por objetos.";
        } else if ("sismo".equals(tipo)) {
            colorFondo = Color.parseColor("#FCD222");
            colorTexto = Color.parseColor("#0B2A4A");
            colorDesc = Color.parseColor("#1D3557");
            colorBadgeBg = Color.parseColor("#D92B00");
            colorBadgeTxt = Color.WHITE;
            colorPasoBg = Color.parseColor("#B8FFFFFF");
            colorNumBg = Color.parseColor("#0B2A4A");
            colorNumTxt = Color.parseColor("#FCD222");
            colorBtnBg = Color.parseColor("#0B2A4A");
            colorBtnTxt = Color.WHITE;
            colorSecBg = Color.parseColor("#220B2A4A");
            colorSecBorde = Color.parseColor("#0B2A4A");
            assetImg = "public/static/img/figma/tarjeta-sismo.jpg";
            badgeTxt = "SISMO / TEMBLOR · UNEXUAM";
            paso1 = "Agáchate y cúbrete cabeza y cuello lejos de ventanas.";
            paso2 = "Al terminar el movimiento, sal caminando al punto seguro.";
        } else if ("inundacion".equals(tipo)) {
            colorFondo = Color.parseColor("#0056B8");
            colorBtnTxt = colorFondo;
            assetImg = "public/static/img/figma/tarjeta-inundacion.jpg";
            badgeTxt = "INUNDACIÓN / TORMENTA · UNEXUAM";
            paso1 = "Aléjate de parqueos bajos, drenajes y cables húmedos.";
            paso2 = "Si el agua sube, resguárdate en piso 2 o 3 (B, C o P).";
        }

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(colorFondo);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_VERTICAL);
        root.setPadding(dp(22), dp(42), dp(22), dp(32));

        LinearLayout headerRow = new LinearLayout(this);
        headerRow.setOrientation(LinearLayout.HORIZONTAL);
        headerRow.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams lpHeader = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lpHeader.bottomMargin = dp(16);

        try (InputStream is = getAssets().open(assetImg)) {
            Bitmap bmp = BitmapFactory.decodeStream(is);
            if (bmp != null) {
                ImageView iv = new ImageView(this);
                iv.setImageBitmap(bmp);
                iv.setScaleType(ImageView.ScaleType.CENTER_CROP);
                iv.setClipToOutline(true);
                GradientDrawable marco = pill(Color.parseColor("#33FFFFFF"), 20);
                marco.setStroke(dp(3), colorTexto);
                iv.setBackground(marco);
                iv.setPadding(dp(3), dp(3), dp(3), dp(3));
                LinearLayout.LayoutParams lpIv = new LinearLayout.LayoutParams(dp(74), dp(74));
                lpIv.rightMargin = dp(14);
                headerRow.addView(iv, lpIv);
            }
        } catch (Exception ignored) {
        }

        TextView badge = new TextView(this);
        badge.setText(badgeTxt);
        badge.setTextColor(colorBadgeTxt);
        badge.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        badge.setTypeface(null, Typeface.BOLD);
        badge.setPadding(dp(14), dp(7), dp(14), dp(7));
        badge.setBackground(pill(colorBadgeBg, 999));
        headerRow.addView(badge, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        root.addView(headerRow, lpHeader);

        TextView tvTitulo = new TextView(this);
        tvTitulo.setText(titulo);
        tvTitulo.setTextColor(colorTexto);
        tvTitulo.setTextSize(TypedValue.COMPLEX_UNIT_SP, 28);
        tvTitulo.setTypeface(null, Typeface.BOLD);
        LinearLayout.LayoutParams lpTit = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lpTit.bottomMargin = dp(10);
        root.addView(tvTitulo, lpTit);

        TextView tvDesc = new TextView(this);
        tvDesc.setText(texto);
        tvDesc.setTextColor(colorDesc);
        tvDesc.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        LinearLayout.LayoutParams lpDesc = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lpDesc.bottomMargin = dp(20);
        root.addView(tvDesc, lpDesc);

        root.addView(crearTarjetaPaso("1", paso1, colorPasoBg, colorNumBg, colorNumTxt, colorTexto));
        root.addView(crearTarjetaPaso("2", paso2, colorPasoBg, colorNumBg, colorNumTxt, colorTexto));

        Button btnRuta = new Button(this);
        btnRuta.setText("VER MI RUTA SEGURA →");
        btnRuta.setTextColor(colorBtnTxt);
        btnRuta.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        btnRuta.setTypeface(null, Typeface.BOLD);
        btnRuta.setBackground(pill(colorBtnBg, 999));
        btnRuta.setAllCaps(false);
        btnRuta.setMinHeight(dp(58));
        LinearLayout.LayoutParams lpBtn1 = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lpBtn1.topMargin = dp(22);
        lpBtn1.bottomMargin = dp(12);
        btnRuta.setOnClickListener(v -> {
            detenerAlarma();
            abrirAppEnCampus();
        });
        root.addView(btnRuta, lpBtn1);

        Button btnSilenciar = new Button(this);
        btnSilenciar.setText("SILENCIAR ALARMA");
        btnSilenciar.setTextColor(colorTexto);
        btnSilenciar.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        btnSilenciar.setTypeface(null, Typeface.BOLD);
        GradientDrawable borde = pill(colorSecBg, 999);
        borde.setStroke(dp(2), colorSecBorde);
        btnSilenciar.setBackground(borde);
        btnSilenciar.setAllCaps(false);
        btnSilenciar.setMinHeight(dp(54));
        btnSilenciar.setOnClickListener(v -> {
            detenerAlarma();
            finish();
        });
        root.addView(btnSilenciar, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        scroll.addView(root);
        setContentView(scroll);
    }

    private LinearLayout crearTarjetaPaso(String num, String txt, int bg, int numBg, int numTxt, int txtColor) {
        LinearLayout fila = new LinearLayout(this);
        fila.setOrientation(LinearLayout.HORIZONTAL);
        fila.setGravity(Gravity.CENTER_VERTICAL);
        fila.setPadding(dp(14), dp(12), dp(14), dp(12));
        fila.setBackground(pill(bg, 18));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(10);
        fila.setLayoutParams(lp);

        TextView tvN = new TextView(this);
        tvN.setText(num);
        tvN.setTextColor(numTxt);
        tvN.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        tvN.setTypeface(null, Typeface.BOLD);
        tvN.setGravity(Gravity.CENTER);
        tvN.setBackground(pill(numBg, 999));
        LinearLayout.LayoutParams lpN = new LinearLayout.LayoutParams(dp(28), dp(28));
        lpN.rightMargin = dp(12);
        fila.addView(tvN, lpN);

        TextView tvT = new TextView(this);
        tvT.setText(txt);
        tvT.setTextColor(txtColor);
        tvT.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14.5f);
        fila.addView(tvT, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        return fila;
    }

    private void abrirAppEnCampus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (km != null && km.isKeyguardLocked()) {
                km.requestDismissKeyguard(this, null);
            }
        }
        Intent main = new Intent(this, MainActivity.class);
        main.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        main.putExtra("ir_a_campus", true);
        startActivity(main);
        finish();
    }

    @SuppressLint("MissingPermission")
    private void iniciarAlarma() {
        detenerAlarma();
        alarmaActiva = true;
        try {
            vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (vibrator != null && vibrator.hasVibrator()) {
                long[] patron = {0, 480, 240, 480, 240};
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createWaveform(patron, 0));
                } else {
                    vibrator.vibrate(patron, 0);
                }
            }
        } catch (Exception ignored) {
        }

        boolean sonoMedia = false;
        try {
            Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            if (uri != null) {
                mediaPlayer = new MediaPlayer();
                mediaPlayer.setDataSource(this, uri);
                mediaPlayer.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build());
                mediaPlayer.setLooping(true);
                mediaPlayer.prepare();
                mediaPlayer.start();
                sonoMedia = true;
            }
        } catch (Exception ignored) {
            liberarMediaPlayer();
        }

        if (!sonoMedia) {
            try {
                toneGen = new ToneGenerator(AudioManager.STREAM_ALARM, 100);
                sirenaHandler = new Handler(Looper.getMainLooper());
                sirenaRunnable = new Runnable() {
                    @Override
                    public void run() {
                        if (!alarmaActiva || toneGen == null) return;
                        try { toneGen.startTone(ToneGenerator.TONE_CDMA_EMERGENCY_RINGBACK, 450); } catch (Exception ignored) {}
                        sirenaHandler.postDelayed(this, 700);
                    }
                };
                sirenaHandler.post(sirenaRunnable);
            } catch (Exception ignored) {
            }
        }
    }

    private void liberarMediaPlayer() {
        if (mediaPlayer != null) {
            try { if (mediaPlayer.isPlaying()) mediaPlayer.stop(); } catch (Exception ignored) {}
            try { mediaPlayer.release(); } catch (Exception ignored) {}
            mediaPlayer = null;
        }
    }

    private void detenerAlarma() {
        alarmaActiva = false;
        liberarMediaPlayer();
        if (sirenaHandler != null && sirenaRunnable != null) {
            sirenaHandler.removeCallbacks(sirenaRunnable);
        }
        if (toneGen != null) {
            try { toneGen.stopTone(); toneGen.release(); } catch (Exception ignored) {}
            toneGen = null;
        }
        if (vibrator != null) {
            try { vibrator.cancel(); } catch (Exception ignored) {}
        }
        try {
            NotificationManagerCompat.from(this).cancel(NOTIF_ALARMA_ID);
        } catch (Exception ignored) {
        }
    }

    @Override
    protected void onDestroy() {
        detenerAlarma();
        if (instanciaActiva == this) instanciaActiva = null;
        super.onDestroy();
    }
}
