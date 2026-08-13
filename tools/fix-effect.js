const fs = require('fs');
const p = 'd:/Custom/Flash/assets/effects/neon-rim.effect';
const better = `CCEffect %{
  techniques:
  - name: opaque
    passes:
    - vert: neon-vs:vert
      frag: neon-fs:frag
      properties: &props
        mainColor:     { value: [0.02, 0.02, 0.02, 1.0], editor: { type: color } }
        rimColor:      { value: [1.0, 0.92, 0.15, 1.0], editor: { type: color } }
        rimPower:      { value: 2.4 }
        rimIntensity:  { value: 4.5 }
        glowBoost:     { value: 1.8 }
        outlineWidth:  { value: 0.04 }
      depthStencilState:
        depthTest: true
        depthWrite: true
      rasterizerState:
        cullMode: back
    - vert: outline-vs:vert
      frag: outline-fs:frag
      properties: *props
      depthStencilState:
        depthTest: true
        depthWrite: false
      rasterizerState:
        cullMode: front
}%

CCProgram neon-vs %{
  precision highp float;
  #include <legacy/input>
  #include <builtin/uniforms/cc-global>
  #include <legacy/local>
  #include <legacy/decode>
  #if USE_SKINNING
    #include <legacy/skinning>
  #endif

  out vec3 v_worldNormal;
  out vec3 v_viewDir;

  vec4 vert () {
    vec4 position;
    vec3 normal;
    vec3 tangent;
    CCDecode(position, normal, tangent);
    #if USE_SKINNING
      CCSkin(position, normal, tangent);
    #endif
    vec4 worldPos = cc_matWorld * position;
    v_worldNormal = normalize((cc_matWorldIT * vec4(normal, 0.0)).xyz);
    v_viewDir = normalize(cc_cameraPos.xyz - worldPos.xyz);
    return cc_matViewProj * worldPos;
  }
}%

CCProgram neon-fs %{
  precision highp float;
  #include <legacy/output>
  in vec3 v_worldNormal;
  in vec3 v_viewDir;
  uniform Constant {
    vec4 mainColor;
    vec4 rimColor;
    float rimPower;
    float rimIntensity;
    float glowBoost;
    float outlineWidth;
  };

  vec4 frag () {
    float ndv = abs(dot(normalize(v_worldNormal), normalize(v_viewDir)));
    float rim = pow(1.0 - clamp(ndv, 0.0, 1.0), rimPower);
    vec3 col = mainColor.rgb + rimColor.rgb * rim * rimIntensity * glowBoost;
    return CCFragOutput(vec4(col, 1.0));
  }
}%

CCProgram outline-vs %{
  precision highp float;
  #include <legacy/input>
  #include <builtin/uniforms/cc-global>
  #include <legacy/local>
  #include <legacy/decode>
  #if USE_SKINNING
    #include <legacy/skinning>
  #endif
  uniform Constant {
    vec4 mainColor;
    vec4 rimColor;
    float rimPower;
    float rimIntensity;
    float glowBoost;
    float outlineWidth;
  };

  vec4 vert () {
    vec4 position;
    vec3 normal;
    vec3 tangent;
    CCDecode(position, normal, tangent);
    #if USE_SKINNING
      CCSkin(position, normal, tangent);
    #endif
    float w = outlineWidth > 0.0 ? outlineWidth : 0.035;
    position.xyz += normalize(normal) * w;
    return cc_matViewProj * (cc_matWorld * position);
  }
}%

CCProgram outline-fs %{
  precision highp float;
  #include <legacy/output>
  uniform Constant {
    vec4 mainColor;
    vec4 rimColor;
    float rimPower;
    float rimIntensity;
    float glowBoost;
    float outlineWidth;
  };
  vec4 frag () {
    vec3 col = rimColor.rgb * (1.25 + glowBoost * 0.4);
    return CCFragOutput(vec4(col, 1.0));
  }
}%
`;
fs.writeFileSync(p, better.replace(/\n/g, '\r\n'));
console.log('ok');
