import * as Phaser from 'phaser';

const fragShader = `
precision mediump float;

uniform sampler2D uMainSampler;
varying vec2 outTexCoord;

// 4x4 Bayer Dither Matrix normalized to 0.0 .. 1.0
const mat4 bayerMatrix = mat4(
     0.0/16.0, 12.0/16.0,  3.0/16.0, 15.0/16.0,
     8.0/16.0,  4.0/16.0, 11.0/16.0,  7.0/16.0,
     2.0/16.0, 10.0/16.0,  1.0/16.0, 13.0/16.0,
    10.0/16.0,  6.0/16.0,  9.0/16.0,  5.0/16.0
);

void main () {
    vec4 color = texture2D(uMainSampler, outTexCoord);
    
    int x = int(mod(gl_FragCoord.x, 4.0));
    int y = int(mod(gl_FragCoord.y, 4.0));
    
    float dither = 0.0;
    if (x == 0 && y == 0) dither = bayerMatrix[0][0];
    else if (x == 1 && y == 0) dither = bayerMatrix[0][1];
    else if (x == 2 && y == 0) dither = bayerMatrix[0][2];
    else if (x == 3 && y == 0) dither = bayerMatrix[0][3];
    else if (x == 0 && y == 1) dither = bayerMatrix[1][0];
    else if (x == 1 && y == 1) dither = bayerMatrix[1][1];
    else if (x == 2 && y == 1) dither = bayerMatrix[1][2];
    else if (x == 3 && y == 1) dither = bayerMatrix[1][3];
    else if (x == 0 && y == 2) dither = bayerMatrix[2][0];
    else if (x == 1 && y == 2) dither = bayerMatrix[2][1];
    else if (x == 2 && y == 2) dither = bayerMatrix[2][2];
    else if (x == 3 && y == 2) dither = bayerMatrix[2][3];
    else if (x == 0 && y == 3) dither = bayerMatrix[3][0];
    else if (x == 1 && y == 3) dither = bayerMatrix[3][1];
    else if (x == 2 && y == 3) dither = bayerMatrix[3][2];
    else if (x == 3 && y == 3) dither = bayerMatrix[3][3];

    float levels = 6.0;
    vec3 posterized = floor(color.rgb * levels + (dither - 0.5) * 0.35) / (levels - 1.0);

    gl_FragColor = vec4(clamp(posterized, 0.0, 1.0), color.a);
}
`;

const BasePipeline: any =
    (Phaser as any).Renderer?.WebGL?.Pipelines?.PostFXPipeline ||
    (Phaser as any).Renderer?.WebGL?.Pipeline ||
    class {};

export class PixelLightPostFX extends BasePipeline {
    constructor(game: Phaser.Game) {
        super({
            game,
            name: 'PixelLightPostFX',
            fragShader,
        });
    }
}
