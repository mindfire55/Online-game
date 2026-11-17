STRIKE ZONE - character models
==============================

models.js loads one rigged, animated human model and uses it for every soldier (enemies and your own body in 3rd person).

Default (no action needed)
  The free "Soldier" model from the three.js examples (Mixamo character, Idle / Walk / Run animations) is downloaded
  automatically from a CDN when the game opens. You need to be online the first time; the browser then caches it.
  Credit: three.js examples (mrdoob/three.js) / Mixamo.

Use your OWN model (optional)
  1. Get a rigged humanoid in .glb format with an Idle, a Walk and a Run animation.
     (Mixamo.com -> pick a character -> download as FBX -> convert to .glb with Blender, or any glTF exporter.)
     The bones should use Mixamo names (mixamorigHips, mixamorigHead, mixamorigLeftArm, mixamorigRightForeArm ...)
     so the hit boxes and the rifle-aiming arms can find them.
  2. Save it as:   strikezone/models/soldier.glb
  3. Reload the game. That file is tried FIRST, the CDN copy is the fallback.

If no model can be loaded the game keeps using the built-in procedural soldiers, nothing breaks.
You can switch the realistic models off under Settings > Graphics > REALISTIC CHARACTER MODELS.
