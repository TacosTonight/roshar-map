import {
  AdditiveBlending,
  Group,
  Mesh,
  PlaneBufferGeometry,
  ShaderMaterial,
  Vector3
} from 'three'
import { clamp01 } from '@/utils'

const State = {
  ENTERING: 0,
  VISIBLE: 1,
  LEAVING: 2
}

export default class Highlight extends Group {
  constructor (x, y, size) {
    super()
    this.position.set(x, y, 1)
    this.frustumCulled = false
    this.opacity = 0
    this.state = State.ENTERING
    this.size = size !== undefined ? size : 0.2

    this.init()
  }

  init () {
    const geo = new PlaneBufferGeometry(1, 1, 1, 1)
    const mat = new ShaderMaterial({
      // language=GLSL
      vertexShader: `
        varying vec2 vUv;

        uniform float Size;
        uniform float Scale;

        void main() {
          vUv = uv * 2. - 1.;

          gl_Position = projectionMatrix * modelViewMatrix * vec4(position * Scale * Size, 1.0);
        }
      `,
      // language=GLSL
      fragmentShader: `
        #ifdef GL_ES
        precision highp float;
        #endif

        uniform float Frequency;
        uniform float TemporalFrequency;
        uniform float Opacity;
        uniform float Bias;
        uniform float Amplitude;
        uniform float InnerRingThickness;
        uniform float Time;
        uniform float Brightness;
        uniform float WhitePoint;
        uniform vec3 Color;

        varying vec2 vUv;

        float simplexNoise(vec3 uv, float res)
        {
          const vec3 s = vec3(1e0, 1e2, 1e3);

          uv *= res;

          vec3 uv0 = floor(mod(uv, res))*s;
          vec3 uv1 = floor(mod(uv+vec3(1.), res))*s;

          vec3 f = fract(uv);
          f = f*f*(3.-2.*f);

          vec4 v = vec4(uv0.x+uv0.y+uv0.z, uv1.x+uv0.y+uv0.z,
          uv0.x+uv1.y+uv0.z, uv1.x+uv1.y+uv0.z);

          vec4 r = fract(sin(v*1e-1)*1e3);
          float r0 = mix(mix(r.x, r.y, f.x), mix(r.z, r.w, f.x), f.y);

          r = fract(sin((v + uv1.z - uv0.z)*1e-1)*1e3);
          float r1 = mix(mix(r.x, r.y, f.x), mix(r.z, r.w, f.x), f.y);

          return mix(r0, r1, f.z)*2.-1.;
        }

        vec4 stormlight(in vec2 p)
        {
          float l = length(p);
          float a = (1. - l) * 3.;
          //make sure to not clip the quad
          a -= Bias;

          vec3 coord = vec3(atan(p.x, p.y)/6.2832+.5, length(p)*.2, .5);
          float power = 1.;
          float t = Time * TemporalFrequency;
          for (int i = 1; i <= 3; i++)
          {
            power *= 2.;
            a += simplexNoise(coord + vec3(0., -t, t*.2), power * Frequency) / power;
          }
          a = max(a * Amplitude, 0.);

          //bright ring around dimmed ring
          float d3 = 0.02;
          float d2 = InnerRingThickness + d3;
          a += smoothstep(d3, 0., l - d2) * 0.25;

          d2 = InnerRingThickness * 1.5 + d3;
          a += smoothstep(d3, 0., abs(l - d2)) * 0.25;

          a *= Brightness;

          vec3 c = Color;

          //bright is white
          c = mix(c, vec3(1, 1, 1), smoothstep(1., WhitePoint, a));
          return vec4(c, a);
        }

        void main(void) {
          //   vec4 c = getColor(vUV);
          vec4 c = stormlight(vUv);
          c.a *= Opacity;
          c.rgb *= c.a;
          gl_FragColor = c;
        }
      `,
      uniforms: {
        Time: { value: 0 },
        Size: { value: this.size },
        Scale: { value: 1 },
        Opacity: { value: 0 },
        Frequency: { value: 4 },
        TemporalFrequency: { value: 0.25 },
        Bias: { value: 0.4 },
        Amplitude: { value: 0.6 },
        InnerRingThickness: { value: 0.1 },
        Brightness: { value: 1 },
        WhitePoint: { value: 3 },
        Color: { value: new Vector3(15 / 255, 53 / 255, 98 / 255) }
      },
      depthTest: false,
      premultipliedAlpha: true,
      transparent: true,
      blending: AdditiveBlending
    })

    this.plane = new Mesh(geo, mat)
    this.plane.frustumCulled = false

    this.add(this.plane)
  }

  leave () {
    this.state = State.LEAVING
  }

  update (camera, timestamp) {
    if (this.state !== State.VISIBLE) {
      this.opacity = clamp01(this.opacity + (this.state === State.ENTERING ? 1 / 30 : -1 / 30))
    }

    if (this.state === State.ENTERING && this.opacity >= 1) {
      this.state = State.VISIBLE
    } else if (this.state === State.LEAVING && this.opacity <= 0) {
      this.parent.remove(this)
    }

    const scale = camera.position.distanceTo(this.position)

    this.plane.material.uniforms.Time.value = timestamp / 1000
    this.plane.material.uniforms.Scale.value = scale
    this.plane.material.uniforms.Opacity.value = this.opacity
  }
}
