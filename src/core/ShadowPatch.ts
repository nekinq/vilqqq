import * as THREE from 'three';

/**
 * Мягкие тени: стандартный PCF в three r186 делает 5 выборок с поворотом шумом — края зернистые.
 * Заменяем на N выборок по диску Фогеля (каждая — аппаратный 2×2 PCF), получая плавную полутень.
 * Патч применяется до компиляции шейдеров; если в будущей версии код другой — тихо пропускаем.
 */
let applied = false;

export function patchSoftShadows(samples = 16): boolean {
  if (applied) return true;
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  const re = /shadow = \(\s*texture\( shadowMap, vec3\( shadowCoord\.xy \+ vogelDiskSample\( 0, 5, phi \) \* radius, shadowCoord\.z \) \) \+[\s\S]*?\) \* 0\.2;/;
  if (!re.test(chunk)) {
    console.warn('[ShadowPatch] формат shadowmap_pars_fragment изменился — оставляю стандартный PCF');
    return false;
  }
  THREE.ShaderChunk.shadowmap_pars_fragment = chunk.replace(
    re,
    `shadow = 0.0;
				for ( int i = 0; i < ${samples}; i ++ ) {
					shadow += texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( i, ${samples}, phi ) * radius, shadowCoord.z ) );
				}
				shadow /= ${samples}.0;`,
  );
  applied = true;
  return true;
}
