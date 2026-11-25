package ni.edu.uam.unexuam;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.content.Context;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.DecelerateInterpolator;
import android.view.animation.OvershootInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;

/**
 * Pantalla de carga 100% GPU RenderThread (ViewPropertyAnimator, 0 onDraw, 0 invalidate).
 * Arranca desde el milisegundo 0 mostrando logo_x_normal exactamente igual al launch screen,
 * anima los rayos de fondo y revela logo_x_oficial sin nada encima.
 */
public class SplashNativoView extends FrameLayout {
    private static final int AZUL_UNEXO = 0xFF0080FF;

    private final ImageView imgRayos;
    private final FrameLayout cajaX;
    private final ImageView imgLogoOficial;
    private final ImageView imgLogoNormal;
    private boolean cerrando = false;

    public SplashNativoView(Context context) {
        super(context);
        setBackgroundColor(AZUL_UNEXO);
        setClickable(true);
        setFocusable(true);
        setElevation(100f);

        float dp = getResources().getDisplayMetrics().density;
        int ladoX = Math.round(148f * dp);

        imgRayos = new ImageView(context);
        imgRayos.setImageResource(R.drawable.splash_rayos_bg);
        imgRayos.setScaleType(ImageView.ScaleType.CENTER_CROP);
        imgRayos.setAlpha(0f);
        imgRayos.setScaleX(0.94f);
        imgRayos.setScaleY(0.94f);
        addView(imgRayos, new LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

        cajaX = new FrameLayout(context);
        LayoutParams lpCaja = new LayoutParams(ladoX, ladoX, Gravity.CENTER);

        imgLogoOficial = new ImageView(context);
        imgLogoOficial.setImageResource(R.drawable.logo_x_oficial);
        imgLogoOficial.setScaleType(ImageView.ScaleType.FIT_CENTER);
        imgLogoOficial.setAlpha(1f);
        cajaX.addView(imgLogoOficial, new LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

        imgLogoNormal = new ImageView(context);
        imgLogoNormal.setImageResource(R.drawable.logo_x_normal);
        imgLogoNormal.setScaleType(ImageView.ScaleType.FIT_CENTER);
        imgLogoNormal.setAlpha(1f);
        cajaX.addView(imgLogoNormal, new LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

        addView(cajaX, lpCaja);

        setOnClickListener(v -> desvanecerYSalir());
    }

    public void iniciar() {
        // 0-650ms: X normal fija desde el ms 0 (transicion invisible desde splash_unexo)
        // 650ms: rayos de marca aparecen en el fondo y la X normal se rompe al logo oficial
        postDelayed(() -> {
            if (cerrando) return;
            imgRayos.animate()
                    .alpha(0.55f)
                    .scaleX(1.03f)
                    .scaleY(1.03f)
                    .setDuration(450L)
                    .setInterpolator(new DecelerateInterpolator())
                    .start();

            cajaX.animate()
                    .scaleX(1.07f)
                    .scaleY(1.07f)
                    .setDuration(120L)
                    .setInterpolator(new DecelerateInterpolator())
                    .withEndAction(() -> {
                        if (!cerrando) {
                            cajaX.animate()
                                    .scaleX(1.0f)
                                    .scaleY(1.0f)
                                    .setDuration(140L)
                                    .setInterpolator(new OvershootInterpolator(1.4f))
                                    .start();
                        }
                    })
                    .start();

            imgLogoNormal.animate()
                    .alpha(0f)
                    .setDuration(180L)
                    .setInterpolator(new DecelerateInterpolator())
                    .withEndAction(() -> imgLogoNormal.setVisibility(View.GONE))
                    .start();
        }, 650L);

        // 2500ms: fade-out directo hacia la app ya lista
        postDelayed(this::desvanecerYSalir, 2500L);
    }

    private void desvanecerYSalir() {
        if (cerrando) return;
        cerrando = true;
        animate()
                .alpha(0f)
                .setDuration(260L)
                .setInterpolator(new DecelerateInterpolator())
                .setListener(new AnimatorListenerAdapter() {
                    @Override
                    public void onAnimationEnd(Animator animation) {
                        if (getParent() instanceof ViewGroup) {
                            ((ViewGroup) getParent()).removeView(SplashNativoView.this);
                        }
                    }
                })
                .start();
    }
}
