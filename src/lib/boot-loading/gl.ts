import { breath, breathGLSL, LAYER_RECT, type Rect } from '@/lib/boot-loading/layout';
import { BOOT_LOADING } from '@/lib/boot-loading/config';

export type LayerName = 'bg' | 'chars' | 'fg' | 'title';
export type ForestImages = Record<LayerName | 'maskBg' | 'maskDepth' | 'maskChars', TexImageSource>;

/** Per-frame state the shader needs. Everything else is a constant set once at creation. */
export type FrameFx = {
    /** Smoothed mouse position, -1..1. */
    mx: number;
    my: number;
    /** 0..1 ease into the 100 % state (arch glow). */
    done: number;
};

/** Extra quad size around each layer (art px) so displaced pixels are not clipped. */
const PAD: Record<LayerName, number> = { bg: 0, chars: 24, fg: 0, title: 8 };
const MODE: Record<LayerName, number> = { bg: 0, chars: 1, fg: 2, title: 3 };
const ORDER: LayerName[] = ['bg', 'chars', 'fg', 'title'];

const VS = `
attribute vec2 q;
uniform vec4 uQuad;  // padded quad rect, art px (x, y, w, h)
uniform vec2 uOff;   // whole-layer offset, art px (parallax / float). 0 in task 02.
uniform vec3 uFit;   // cover fit in DEVICE px: ox, oy, scale
uniform vec2 uView;  // canvas buffer size, device px
varying vec2 vArt;   // art px of this fragment's CONTENT (offset removed)
void main() {
    vec2 a = uQuad.xy + q * uQuad.zw;
    vArt = a;
    vec2 d = uFit.xy + (a + uOff) * uFit.z;
    gl_Position = vec4(d.x / uView.x * 2.0 - 1.0, 1.0 - d.y / uView.y * 2.0, 0.0, 1.0);
}`;

/**
 * The breath curve is GENERATED from the TS `breath()` so the shader and the tests can never
 * disagree about what one breath looks like.
 */
const makeFS = (w: number) => `
precision highp float;
uniform sampler2D uTex;       // unit 0: the layer
uniform sampler2D uMaskBg;    // unit 1: B mushroom (R/G unused: the sky is frozen)
uniform sampler2D uMaskDepth; // unit 2: R depth, G sway
uniform sampler2D uMaskChars; // unit 3: R belly, G ears+tail, B hair+bow (chars rect)
uniform vec4 uRect;           // UNPADDED layer rect, art px
uniform int uMode;            // 0 bg, 1 chars, 2 fg, 3 title
uniform float uT;             // seconds
uniform float uK;             // effect ease 0..1 (smoothstepped on the JS side)
uniform vec2 uMouse;         // smoothed mouse, -1..1
uniform float uGlow, uSway;   // ground-only ambient
uniform vec2 uSkyGate;        // depth-mask bounds where open sky ends
uniform vec4 uArch;           // arch glow centre xy + falloff radii zw (art px)
uniform vec3 uArchColor;      // warm yellow, rgb 0..1
uniform float uArchHz, uArchAmt;
uniform float uDone;          // arch tint strength: idle while loading, eased to the 100 % peak
uniform vec4 uLag;           // per-character lag (s): guy, cat, bunny, blonde
uniform float uBody, uBelly, uEarC, uEarB, uTailR, uHair;
uniform vec2 uBellyGate;       // belly mask window: fades in between lo and hi
varying vec2 vArt;
const vec2 ART = vec2(1920.0, 1072.0);
${breathGLSL(w)}
vec2 rot(vec2 p, vec2 c, float a) { vec2 o = p - c; return c + vec2(o.x * cos(a) - o.y * sin(a), o.x * sin(a) + o.y * cos(a)); }
void main() {
    vec2 p = vArt;            // sample position in art px; effects displace p
    // [[03-DISPLACE]] — ground only. The sky is frozen: nothing here touches it, and the sway
    // is gated off wherever the depth mask still reads as open sky.
    if (uMode == 0 || uMode == 2) {
        vec2 a0 = vArt / ART;
        vec3 dm = texture2D(uMaskDepth, a0).rgb; // r depth, g sway
        float ground = smoothstep(uSkyGate.x, uSkyGate.y, dm.r);
        float gust = 0.6 + 0.4 * sin(uT * 0.37);
        p.x += sin(uT * 1.3 + p.y * 0.035 + p.x * 0.01) * uSway * dm.g * ground * gust * uK; // grass / leaves
    }
    // [[04-CHARS]]
    if (uMode == 1) {
        vec2 cuv = clamp((vArt - uRect.xy) / uRect.zw, 0.0, 1.0);
        vec3 cm = texture2D(uMaskChars, cuv).rgb; // r belly, g ears + tail, b hair + bow
        float x = vArt.x;
        bool guy = x < 740.0 && cm.g < 0.001; // G>0 left of 740 = cat-tail margin, not the guy
        float lag = guy ? uLag.x : x < 985.0 ? uLag.y : x < 1250.0 ? uLag.z : uLag.w;
        float feet = guy ? 955.0 : x < 985.0 ? 965.0 : x < 1250.0 ? 965.0 : 960.0;
        float b = br(uT - lag);                       // 0..1, shared curve
        // whole body: rises slightly on inhale, anchored at the feet
        p.y += (feet - p.y) * uBody * b * uK;
        // The guy's belly swells (sample towards the centre = bigger). Gated on the mask's own
        // gradient, not used raw: the mask is one soft blob across his whole torso, so ungated it
        // would push his arms out with the belly. smoothstep is also what feathers the edge — the
        // swell dies away over a band of mask values instead of stopping dead at a boundary, which
        // is what would otherwise show as a ring around his middle.
        float belly = smoothstep(uBellyGate.x, uBellyGate.y, cm.r);
        p -= (p - vec2(633.0, 795.0)) * uBelly * b * belly * uK;
        // ears + cat tail: small rotations about their pivots, lagging the breath
        if (cm.g > 0.001) {
            vec2 piv;
            float ang;
            if (x < 985.0) {
                if (vArt.y > 705.0 && x < 850.0) { piv = vec2(820.0, 873.0); ang = uTailR * (2.0 * br(uT - lag - 0.3) - 1.0); }
                else { piv = x < 830.0 ? vec2(803.5, 661.0) : vec2(874.0, 630.0); ang = uEarC * (2.0 * br(uT - lag - 0.15) - 1.0); }
            } else {
                piv = x < 1126.0 ? vec2(1099.0, 587.0) : vec2(1153.0, 597.0); ang = uEarB * (2.0 * br(uT - lag - 0.25) - 1.0);
            }
            p = mix(p, rot(p, piv, -ang), cm.g * uK);
        }
        // hair (blonde + bunny) sways at the tips; bow rides with the hair top (≈ no motion)
        float hs = 2.0 * br(uT - lag - 0.4) - 1.0;
        p.x -= uHair * hs * cm.b * clamp((vArt.y - 640.0) / 160.0, 0.0, 1.0) * uK;
    }
    vec2 uv = (p - uRect.xy) / uRect.zw;
    bool outside = uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0;
    if (uMode == 0) { uv = clamp(uv, 0.0, 1.0); outside = false; }
    vec4 c = outside ? vec4(0.0) : texture2D(uTex, uv);
    // [[03-COLOR]] — ground only. Mushroom glow rides mask-bg B, which is 0 across the whole sky.
    if (uMode == 0 || uMode == 2) {
        float mush = texture2D(uMaskBg, vArt / ART).b;
        float pulse = 0.5 + 0.5 * sin(uT * 1.6 + vArt.x * 0.01);
        c.rgb += (c.rgb * uGlow + vec3(0.10, 0.05, 0.12) * c.a) * mush * pulse * uK;
        // The stone arch lights up warm yellow, breathing gently from the moment the splash
        // appears and brightening at 100 %. TINT rather than add: the target colour is uArchColor
        // scaled by the stone's own luminance, so the result can never exceed it — the bright
        // arch stone (≈210/208/156) does not clip to white even at full strength. The arch stands
        // on the forest floor, so this is not a sky effect.
        vec2 ad = (vArt - uArch.xy) / uArch.zw;
        float beat = 1.0 - uArchAmt + uArchAmt * (0.5 + 0.5 * sin(uT * uArchHz));
        float lit = exp(-dot(ad, ad) * 1.5) * uDone * beat * c.a;
        vec3 warm = uArchColor * (0.35 + 0.65 * dot(c.rgb, vec3(0.299, 0.587, 0.114)));
        c.rgb = mix(c.rgb, warm, clamp(lit, 0.0, 1.0));
    }
    gl_FragColor = c;
}`;

/** Compile one shader stage. Throws with the driver log so a failure is diagnosable. */
function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
    const sh = gl.createShader(type);
    if (!sh) throw new Error('createShader failed');
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error('shader compile failed: ' + log);
    }
    return sh;
}

export interface ForestGL {
    /** Canvas buffer size (device px) + cover fit in device px. */
    resize(w: number, h: number, ox: number, oy: number, s: number): void;
    /** Replace a layer texture (used for pre-downscaled copies on small screens). */
    upload(layer: LayerName, src: TexImageSource): void;
    /** Draw one frame. t = seconds since start, k = effect ease 0..1. */
    draw(t: number, k: number, fx: FrameFx): void;
}

export type FrameUniforms = {
    /** The reveal ease, smoothstepped — the multiplier every animated term carries. */
    ke: number;
    /** Arch-glow tint strength. Gated by ke, so it is 0 on the very first frame. */
    done: number;
    /** Whole-layer offset in art px, one entry per drawn layer. */
    offsets: Record<LayerName, [number, number]>;
};

/**
 * Every number that moves the picture this frame, as plain arithmetic with no GL in it — so
 * "nothing moves before the splash is visible" is a unit test rather than a promise. `draw`
 * does nothing but hand the result to the GPU.
 *
 * The contract this exists to protect: at `k = 0` EVERY offset is [0,0] and `done` is 0, so
 * frame one is the static `<img>` composited again — no arch glow, no title float, nothing that
 * would make the handover to the canvas a visible jump.
 */
export function frameUniforms(fx: FrameFx, t: number, k: number, effect = 1): FrameUniforms {
    const P = BOOT_LOADING;
    const ke = k * k * (3 - 2 * k);
    const archIdle = P.ARCH_GLOW_IDLE * effect;
    const archPeak = P.ARCH_GLOW * effect;
    const parTitle = P.PARALLAX_TITLE * effect;
    const titleFloat = P.TITLE_FLOAT_PX * effect;
    return {
        ke,
        done: (archIdle + (archPeak - archIdle) * fx.done) * ke,
        offsets: {
            // No parallax below the title: the characters stay locked to their bg shadows.
            bg: [0, 0],
            chars: [0, 0],
            fg: [0, 0],
            title: [
                fx.mx * parTitle * ke,
                (fx.my * parTitle + (1 - 2 * breath(t, P.BREATH_W)) * titleFloat) * ke,
            ],
        },
    };
}

/**
 * `effect` scales every effect amplitude (1 = full, see `effectScale()`): phones get the same
 * effects, softer. Layer positions and the cover fit are never scaled by it.
 */
export function createForestGL(gl: WebGLRenderingContext, img: ForestImages, effect = 1): ForestGL {
    const vs = compile(gl, gl.VERTEX_SHADER, VS);
    const fs = compile(gl, gl.FRAGMENT_SHADER, makeFS(BOOT_LOADING.BREATH_W));
    const prog = gl.createProgram();
    if (!prog) throw new Error('createProgram failed');
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'q');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error('program link failed: ' + gl.getProgramInfoLog(prog));
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    gl.useProgram(prog);

    const loc = (name: string): WebGLUniformLocation | null => gl.getUniformLocation(prog, name);
    const uQuad = loc('uQuad');
    const uOff = loc('uOff');
    const uFit = loc('uFit');
    const uView = loc('uView');
    const uRect = loc('uRect');
    const uMode = loc('uMode');
    const uT = loc('uT');
    const uK = loc('uK');
    const uMouse = loc('uMouse');
    const uLag = loc('uLag');
    const uDone = loc('uDone');

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    /**
     * Upload `src` on texture `unit` and return the texture object. Layers are premultiplied so
     * they blend with ONE / ONE_MINUS_SRC_ALPHA; masks are NOT (they carry no alpha).
     * NPOT-safe: LINEAR + CLAMP_TO_EDGE, no mipmaps.
     */
    function tex(unit: number, src: TexImageSource, premultiply: boolean): WebGLTexture {
        const t = gl.createTexture();
        if (!t) throw new Error('createTexture failed');
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
    }

    const layerTex: Record<LayerName, WebGLTexture> = {
        bg: tex(0, img.bg, true),
        chars: tex(0, img.chars, true),
        fg: tex(0, img.fg, true),
        title: tex(0, img.title, true),
    };
    // Masks live on their own units for the whole life of the context.
    tex(1, img.maskBg, false);
    tex(2, img.maskDepth, false);
    tex(3, img.maskChars, false);

    gl.uniform1i(loc('uTex'), 0);
    gl.uniform1i(loc('uMaskBg'), 1);
    gl.uniform1i(loc('uMaskDepth'), 2);
    gl.uniform1i(loc('uMaskChars'), 3);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0.012, 0.02, 0.031, 1);

    // Effect constants never change during the splash's life.
    const P = BOOT_LOADING;
    gl.uniform1f(loc('uGlow'), P.MUSHROOM_GLOW * effect);
    gl.uniform1f(loc('uSway'), P.SWAY_PX * effect);
    gl.uniform2f(loc('uSkyGate'), P.SKY_GATE_LO, P.SKY_GATE_HI);
    gl.uniform4f(loc('uArch'), P.ARCH_X, P.ARCH_Y, P.ARCH_RX, P.ARCH_RY);
    gl.uniform3f(
        loc('uArchColor'),
        P.ARCH_GLOW_COLOR[0],
        P.ARCH_GLOW_COLOR[1],
        P.ARCH_GLOW_COLOR[2],
    );
    gl.uniform1f(loc('uArchHz'), P.ARCH_PULSE_HZ);
    gl.uniform1f(loc('uArchAmt'), P.ARCH_PULSE_AMT);
    gl.uniform4f(uLag, P.CHAR_LAG_S[0], P.CHAR_LAG_S[1], P.CHAR_LAG_S[2], P.CHAR_LAG_S[3]);
    gl.uniform1f(loc('uBody'), P.BODY_STRETCH * effect);
    gl.uniform1f(loc('uBelly'), P.BELLY_SCALE * effect);
    gl.uniform2f(loc('uBellyGate'), P.BELLY_MASK_LO, P.BELLY_MASK_HI);
    gl.uniform1f(loc('uEarC'), P.EAR_CAT_RAD * effect);
    gl.uniform1f(loc('uEarB'), P.EAR_BUNNY_RAD * effect);
    gl.uniform1f(loc('uTailR'), P.TAIL_RAD * effect);
    gl.uniform1f(loc('uHair'), P.HAIR_PX * effect);
    // Zero, not ARCH_GLOW_IDLE: the arch tint has to ride the same k ramp as every other effect,
    // or frame one shows a warm arch the static <img> does not have — a visible pop exactly at the
    // handover. draw() sets the real value from there.
    gl.uniform1f(uDone, 0);

    return {
        resize(w, h, ox, oy, s) {
            gl.viewport(0, 0, w, h);
            gl.uniform2f(uView, w, h);
            gl.uniform3f(uFit, ox, oy, s);
        },

        upload(layer, src) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, layerTex[layer]);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
            gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
        },

        draw(t, k, fx) {
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.useProgram(prog);
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
            const u = frameUniforms(fx, t, k, effect);
            gl.uniform1f(uT, t);
            gl.uniform1f(uK, u.ke);
            gl.uniform2f(uMouse, fx.mx, fx.my);
            gl.uniform1f(uDone, u.done);
            for (const name of ORDER) {
                const r: Rect = LAYER_RECT[name];
                const pad = PAD[name];
                const off = u.offsets[name];
                gl.uniform4f(uQuad, r.x - pad, r.y - pad, r.w + 2 * pad, r.h + 2 * pad);
                gl.uniform4f(uRect, r.x, r.y, r.w, r.h);
                gl.uniform1i(uMode, MODE[name]);
                gl.uniform2f(uOff, off[0], off[1]);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, layerTex[name]);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }
        },
    };
}
