package ni.edu.uam.unexuam;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PathMeasure;
import android.graphics.RectF;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.LinearInterpolator;

/**
 * Pantalla de carga nativa sin lag a 60-120 FPS usando el bitmap oficial de la X UNEXO.
 * Inicia como X normal, traza la ruptura con rayos y muestra la X oficial exacta.
 */
public class SplashNativoView extends View {
    private static final int AZUL_UNEXO = 0xFF0080FF;
    private static final int AMARILLO_UNEXO = 0xFFFCD222;
    private static final long DURACION_MS = 2800L;

    private final Bitmap logoOficial;
    private final Paint paintFondo = new Paint();
    private final Paint paintLogo = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private final Paint paintSello = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint paintRayoGrieta = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint paintRayoFondo = new Paint(Paint.ANTI_ALIAS_FLAG);

    private final RectF dstLogo = new RectF();
    private final Path pathSelloBlanco = new Path();
    private final Path pathGrieta = new Path();
    private final Path pathGrietaParcial = new Path();
    private final PathMeasure measureGrieta = new PathMeasure();

    private final Path[] rayosFondo = new Path[8];
    private final PathMeasure[] measuresRayos = new PathMeasure[8];
    private final Path pathRayoTemp = new Path();

    private float tamX = 0f;
    private float progreso = 0f;
    private ValueAnimator animator;
    private boolean cerrando = false;

    public SplashNativoView(Context context) {
        super(context);
        setClickable(true);
        setFocusable(true);
        setElevation(100f);
        setLayerType(LAYER_TYPE_HARDWARE, null);

        logoOficial = BitmapFactory.decodeResource(getResources(), R.drawable.logo_x_oficial);

        paintFondo.setColor(AZUL_UNEXO);
        paintSello.setColor(Color.WHITE);
        paintSello.setStyle(Paint.Style.FILL);

        paintRayoGrieta.setColor(AMARILLO_UNEXO);
        paintRayoGrieta.setStyle(Paint.Style.STROKE);
        paintRayoGrieta.setStrokeCap(Paint.Cap.ROUND);
        paintRayoGrieta.setStrokeJoin(Paint.Join.ROUND);

        paintRayoFondo.setColor(Color.WHITE);
        paintRayoFondo.setStyle(Paint.Style.STROKE);
        paintRayoFondo.setStrokeCap(Paint.Cap.ROUND);
        paintRayoFondo.setStrokeJoin(Paint.Join.ROUND);

        for (int i = 0; i < rayosFondo.length; i++) {
            rayosFondo[i] = new Path();
            measuresRayos[i] = new PathMeasure();
        }

        setOnClickListener(v -> {
            if (progreso > 0.55f) desvanecerYSalir();
        });
    }

    public void iniciar() {
        if (animator != null) animator.cancel();
        animator = ValueAnimator.ofFloat(0f, 1f);
        animator.setDuration(DURACION_MS);
        animator.setInterpolator(new LinearInterpolator());
        animator.addUpdateListener(anim -> {
            progreso = (float) anim.getAnimatedValue();
            invalidate();
        });
        animator.addListener(new AnimatorListenerAdapter() {
            @Override
            public void onAnimationEnd(Animator animation) {
                desvanecerYSalir();
            }
        });
        animator.start();
    }

    private void desvanecerYSalir() {
        if (cerrando) return;
        cerrando = true;
        if (animator != null) animator.cancel();
        animate()
                .alpha(0f)
                .scaleX(1.03f)
                .scaleY(1.03f)
                .setDuration(280L)
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

    @Override
    protected void onSizeChanged(int w, int h, int oldw, int oldh) {
        super.onSizeChanged(w, h, oldw, oldh);
        if (w <= 0 || h <= 0) return;

        tamX = Math.min(w, h) * 0.35f;
        float ratio = (logoOficial != null && logoOficial.getWidth() > 0)
                ? (float) logoOficial.getHeight() / logoOficial.getWidth()
                : 1f;
        float halfW = tamX * 0.5f;
        float halfH = tamX * ratio * 0.5f;
        dstLogo.set(-halfW, -halfH, halfW, halfH);

        // Sello blanco que cubre la grieta central de logo_x_oficial para que inicie como X normal
        pathSelloBlanco.reset();
        pathSelloBlanco.moveTo(-halfW * 0.16f, -halfH * 0.34f);
        pathSelloBlanco.lineTo(halfW * 0.21f, -halfH * 0.64f);
        pathSelloBlanco.lineTo(halfW * 0.27f, -halfH * 0.44f);
        pathSelloBlanco.lineTo(halfW * 0.14f, halfH * 0.04f);
        pathSelloBlanco.lineTo(halfW * 0.02f, halfH * 0.36f);
        pathSelloBlanco.lineTo(-halfW * 0.04f, halfH * 0.36f);
        pathSelloBlanco.lineTo(-halfW * 0.17f, -halfH * 0.10f);
        pathSelloBlanco.close();

        // Trazo exacto de la grieta/rayo en zig-zag para la ruptura
        pathGrieta.reset();
        pathGrieta.moveTo(halfW * 0.21f, -halfH * 0.68f);
        pathGrieta.lineTo(halfW * 0.01f, -halfH * 0.41f);
        pathGrieta.lineTo(halfW * 0.08f, -halfH * 0.13f);
        pathGrieta.lineTo(-halfW * 0.05f, halfH * 0.05f);
        pathGrieta.lineTo(0f, halfH * 0.34f);
        measureGrieta.setPath(pathGrieta, false);

        construirRayosFondo(w, h);
    }

    private void construirRayosFondo(int w, int h) {
        float wf = w;
        float hf = h;
        float[][] coords = {
                {0.14f, -0.02f, 0.23f, 0.14f, 0.17f, 0.18f, 0.28f, 0.34f},
                {0.86f, -0.02f, 0.76f, 0.16f, 0.82f, 0.20f, 0.70f, 0.36f},
                {-0.02f, 0.30f, 0.21f, 0.36f, 0.16f, 0.40f, 0.36f, 0.46f},
                {1.02f, 0.29f, 0.79f, 0.36f, 0.84f, 0.39f, 0.64f, 0.46f},
                {0.38f, 0.50f, 0.29f, 0.58f, 0.34f, 0.60f, 0.18f, 0.72f},
                {0.62f, 0.50f, 0.71f, 0.58f, 0.66f, 0.60f, 0.84f, 0.73f},
                {0.10f, 0.72f, 0.27f, 0.81f, 0.22f, 0.84f, 0.36f, 0.99f},
                {0.90f, 0.72f, 0.73f, 0.81f, 0.78f, 0.84f, 0.64f, 0.99f}
        };
        for (int i = 0; i < rayosFondo.length; i++) {
            Path p = rayosFondo[i];
            p.reset();
            p.moveTo(coords[i][0] * wf, coords[i][1] * hf);
            p.lineTo(coords[i][2] * wf, coords[i][3] * hf);
            p.lineTo(coords[i][4] * wf, coords[i][5] * hf);
            p.lineTo(coords[i][6] * wf, coords[i][7] * hf);
            measuresRayos[i].setPath(p, false);
        }
    }

    private float clamp01(float x) {
        return Math.max(0f, Math.min(1f, x));
    }

    private float easeOutCubic(float t) {
        float u = 1f - clamp01(t);
        return 1f - u * u * u;
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        int w = getWidth();
        int h = getHeight();
        if (w <= 0 || h <= 0) return;

        canvas.drawRect(0, 0, w, h, paintFondo);

        float t = progreso;
        float dp = getResources().getDisplayMetrics().density;

        // Rayos del manual de marca en el fondo
        paintRayoFondo.setStrokeWidth(2.1f * dp);
        for (int i = 0; i < rayosFondo.length; i++) {
            float inicio = 0.26f + i * 0.025f;
            float progRayo = easeOutCubic((t - inicio) / 0.28f);
            if (progRayo > 0f) {
                float len = measuresRayos[i].getLength();
                pathRayoTemp.reset();
                measuresRayos[i].getSegment(0f, len * progRayo, pathRayoTemp, true);
                float fade = t < 0.78f ? 1f : 1f - 0.5f * clamp01((t - 0.78f) / 0.22f);
                paintRayoFondo.setAlpha((int) (82f * Math.min(1f, progRayo * 1.4f) * fade));
                canvas.drawPath(pathRayoTemp, paintRayoFondo);
            }
        }

        float cx = w * 0.5f;
        float cy = h * 0.5f;
        float entrada = easeOutCubic(t / 0.20f);
        float escala = 0.88f + 0.12f * entrada;

        // Pulso sutil de impacto al romperse (0.42 -> 0.58)
        if (t >= 0.42f && t <= 0.58f) {
            float k = (t - 0.42f) / 0.16f;
            escala += 0.06f * (float) Math.sin(k * Math.PI);
        }

        // Vibracion sismica suave (0.30 -> 0.46)
        float shakeX = 0f;
        float shakeY = 0f;
        if (t >= 0.30f && t <= 0.46f) {
            float k = (t - 0.30f) / 0.16f;
            float amp = tamX * 0.022f * (1f - Math.abs(k * 2f - 1f));
            shakeX = (float) Math.sin(k * Math.PI * 5.0) * amp;
            shakeY = (float) Math.cos(k * Math.PI * 4.0) * amp * 0.7f;
        }

        canvas.save();
        canvas.translate(cx + shakeX, cy + shakeY);
        canvas.scale(escala, escala);

        // 1. Logo oficial exacto (sin caja, sin bordes)
        if (logoOficial != null) {
            paintLogo.setAlpha((int) (255f * entrada));
            canvas.drawBitmap(logoOficial, null, dstLogo, paintLogo);
        }

        // 2. Sello blanco para mostrar X normal al inicio (0.00 -> 0.46), se abre al romperse (0.46 -> 0.58)
        if (t < 0.58f) {
            float alphaSello = t <= 0.46f ? 1f : 1f - clamp01((t - 0.46f) / 0.12f);
            paintSello.setAlpha((int) (255f * entrada * alphaSello));
            canvas.drawPath(pathSelloBlanco, paintSello);
        }

        // 3. Rayo amarillo dibujando la grieta en el instante del quiebre (0.32 -> 0.56)
        if (t >= 0.32f && t <= 0.56f) {
            float pRayo = easeOutCubic((t - 0.32f) / 0.13f);
            float alphaRayo = t < 0.45f ? 1f : 1f - clamp01((t - 0.45f) / 0.11f);
            pathGrietaParcial.reset();
            measureGrieta.getSegment(0f, measureGrieta.getLength() * pRayo, pathGrietaParcial, true);
            paintRayoGrieta.setStrokeWidth(3.4f * dp);
            paintRayoGrieta.setAlpha((int) (255f * alphaRayo));
            canvas.drawPath(pathGrietaParcial, paintRayoGrieta);
        }

        canvas.restore();
    }
}
