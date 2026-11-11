export const floorVSText = `
    precision mediump float;

    uniform vec4 uLightPos;
    uniform mat4 uWorld;
    uniform mat4 uView;
    uniform mat4 uProj;
    
    attribute vec4 aVertPos;

    varying vec4 vClipPos;

    void main () {

        gl_Position = uProj * uView * uWorld * aVertPos;
        vClipPos = gl_Position;
    }
`;

export const floorFSText = `
    precision mediump float;

    uniform mat4 uViewInv;
    uniform mat4 uProjInv;
    uniform vec4 uLightPos;

    varying vec4 vClipPos;

    void main() {
        vec4 wsPos = uViewInv * uProjInv * vec4(vClipPos.xyz/vClipPos.w, 1.0);
        wsPos /= wsPos.w;
        /* Determine which color square the position is in */
        float checkerWidth = 5.0;
        float i = floor(wsPos.x / checkerWidth);
        float j = floor(wsPos.z / checkerWidth);
        vec3 color = mod(i + j, 2.0) * vec3(1.0, 1.0, 1.0);

        /* Compute light fall off */
        vec4 lightDirection = uLightPos - wsPos;
        float dot_nl = dot(normalize(lightDirection), vec4(0.0, 1.0, 0.0, 0.0));
	    dot_nl = clamp(dot_nl, 0.0, 1.0);
	
        gl_FragColor = vec4(clamp(dot_nl * color, 0.0, 1.0), 1.0);
    }
`;

export let waterVSText = `
    precision mediump float;

    attribute vec3 vertPosition;
    attribute vec3 vertColor;
    attribute vec4 aNorm;
    
    varying vec4 lightDir;
    varying vec4 normal;  
    varying vec3 vWorldpos; 
 
    uniform vec4 lightPosition;
    uniform mat4 mWorld;
    uniform mat4 mView;
	uniform mat4 mProj;


    void main () {
        vWorldpos = vertPosition;
		//  Convert vertex to camera coordinates and the NDC
        gl_Position = mProj * mView * mWorld * vec4 (vertPosition, 1.0);
        
        //  Compute light direction (world coordinates)
        lightDir = lightPosition - vec4(vertPosition, 1.0);
		
        //  Pass along the vertex normal (world coordinates)
        normal = aNorm;

    }
`;



export let waterFSText = `
    precision mediump float;

    varying vec4 lightDir;
    varying vec4 normal;   
    varying vec3 vWorldpos; 
	
    
    void main () {
        vec2 coord = vWorldpos.xz / 5.0;
        //float pattern = step(0.5, mod(floor(coord.x) + floor(coord.y), 2.0));
        vec3 baseColor = vec3(0.0, 0.4, 1.0);  // Water color

        //vec3 baseColor = mix(vec3(0.0), vec3(1.0), pattern);

        // Diffuse lighting
        vec3 N = normalize(normal).xyz;
        vec3 L = normalize(lightDir).xyz;
        float diffuse = abs(dot(N, L));
        //float specular = pow(max(dot(reflect(-L, N), normalize(-vWorldpos)), 0.0), 30.0); 
        gl_FragColor = vec4(baseColor * diffuse, 1.0);
 
    }
`;

export const sceneVSText = `precision mediump float;
attribute vec3 vertPosition;
attribute vec2 aUV;
attribute vec3 aNorm;
attribute vec4 skinIndices;
attribute vec4 skinWeights;
attribute vec3 v0;
attribute vec3 v1;
attribute vec3 v2;
attribute vec3 v3;
varying vec2 vUV;
varying vec4 lightDir;
varying vec2 uv;
varying vec4 normal;
uniform vec4 lightPosition;
uniform mat4 mWorld;
uniform mat4 mView;
uniform mat4 mProj;
uniform vec3 jTrans[64];
uniform vec4 jRots[64];


vec4 quatMul(vec4 q1, vec4 q2) {
    return vec4(
        q1.w * q2.x + q1.x * q2.w + q1.y * q2.z - q1.z * q2.y,
        q1.w * q2.y - q1.x * q2.z + q1.y * q2.w + q1.z * q2.x,
        q1.w * q2.z + q1.x * q2.y - q1.y * q2.x + q1.z * q2.w,
        q1.w * q2.w - q1.x * q2.x - q1.y * q2.y - q1.z * q2.z
    );
}


vec4 turnDual(vec3 t, vec4 r) {
    vec4 translation = vec4(t.x, t.y, t.z, 0.0);
    vec4 i_part = quatMul(translation, r);
    return vec4((i_part.x/2.0), (i_part.y/2.0), (i_part.z/2.0), (i_part.w/2.0));
    
}

vec4 Mtransform(vec4 dualPart, vec4 realPart, vec3 pos) {

    float t_zero = 2.0 * (-dualPart.w*realPart.x + dualPart.x*realPart.w - dualPart.y*realPart.z + dualPart.z*realPart.y);
    float t_one = 2.0 * (-dualPart.w*realPart.y + dualPart.x*realPart.z + dualPart.y*realPart.w - dualPart.z*realPart.x);
    float t_two = 2.0 * (-dualPart.w*realPart.z - dualPart.x*realPart.y + dualPart.y*realPart.x + dualPart.z*realPart.w);
    float m_one = 1.0 - 2.0 *(realPart.y*realPart.y) - 2.0 *(realPart.z*realPart.z);
    float m_two = 2.0 *(realPart.x*realPart.y) + 2.0 *(realPart.w*realPart.z);
    float m_three = 2.0 *(realPart.x*realPart.z) - 2.0 *(realPart.w*realPart.y);
    float m_four = 2.0 *(realPart.x * realPart.y) - 2.0 *(realPart.w * realPart.z);
    float m_five = 1.0 - 2.0 *(realPart.x*realPart.x) - 2.0 *(realPart.z*realPart.z);
    float m_six = 2.0 *(realPart.y*realPart.z) + 2.0 *(realPart.w*realPart.x);
    float m_seven = 2.0 *(realPart.x*realPart.z) + 2.0 *(realPart.w*realPart.y);
    float m_eight = 2.0 *(realPart.y*realPart.z) - 2.0 *(realPart.w*realPart.x);
    float m_nine = 1.0 - 2.0 *(realPart.x*realPart.x) - 2.0 *(realPart.y*realPart.y);

    vec4 row1  = vec4(m_one, m_four, m_seven, t_zero);
    vec4 row2  = vec4(m_two, m_five, m_eight, t_one);
    vec4 row3  = vec4(m_three, m_six, m_nine, t_two);


    float v_row1 = dot(row1, vec4(pos.x, pos.y, pos.z, 1.0));
    float v_row2 = dot(row2, vec4(pos.x, pos.y, pos.z, 1.0));
    float v_row3 = dot(row3, vec4(pos.x, pos.y, pos.z, 1.0));

    return vec4(v_row1, v_row2, v_row3, 1.0);
}

void main() {
    // Calculate weighted vertex position - needed for rest pose accuracy
    vec3 blendedLocalPos = vec3(0.0);
    if (skinWeights.x > 0.0) blendedLocalPos += v0 * skinWeights.x;
    if (skinWeights.y > 0.0) blendedLocalPos += v1 * skinWeights.y;
    if (skinWeights.z > 0.0) blendedLocalPos += v2 * skinWeights.z;
    if (skinWeights.w > 0.0) blendedLocalPos += v3 * skinWeights.w;
    
    vec4 realPart = vec4(0.0);
    vec4 dualPart = vec4(0.0);
 
    int refBoneIndex = int(skinIndices.x);
    vec4 refQuat = jRots[refBoneIndex];
    
    // Accumulate weighted dual quaternions from all influencing bones
    for (int i = 0; i < 4; i++) {
        float weight = skinWeights[i];
        if (weight > 0.0) {
            int boneIndex = int(skinIndices[i]);
            
          
            vec4 boneQuat = jRots[boneIndex];
            
            // Handle antipodality (important for consistent blending)
            if (dot(refQuat, boneQuat) < 0.0) {
                // Only negate if this would result in a shorter interpolation path
                if (abs(boneQuat.w) > 0.707) { // cos(45°) threshold
                    boneQuat = -boneQuat;
                }
            }
            
            vec3 boneTrans = jTrans[boneIndex];
            
            vec4 d_Quat = turnDual(boneTrans, boneQuat);
            
            realPart += weight * boneQuat;
            dualPart += weight * d_Quat;
           
        }
    }

    float real_length = sqrt(realPart.x * realPart.x + realPart.y * realPart.y + realPart.z * realPart.z  + realPart.w * realPart.w);
    realPart = vec4(realPart.x / real_length, realPart.y / real_length, realPart.z / real_length, realPart.w / real_length);
    dualPart = vec4(dualPart.x/ real_length, dualPart.y / real_length, dualPart.z / real_length, dualPart.w / real_length); 
    
    vec4 finalPos = Mtransform(dualPart, realPart, blendedLocalPos);
 
    vec4 worldPos = mWorld * finalPos;
 
    gl_Position = mProj * mView * worldPos;
    lightDir = lightPosition - worldPos;
    normal = normalize(mWorld * vec4(aNorm, 0.0));
    uv = aUV;
    vUV = aUV;
    

    
}`;

export const sceneFSText = `
    precision mediump float;

    uniform sampler2D uTexture;
    uniform bool uUseTexture;
    varying vec2 vUV;
    varying vec4 lightDir;
    varying vec2 uv;
    varying vec4 normal;

    void main () {
        vec4 texColor = texture2D(uTexture, vUV);
        vec4 normalColor = vec4((normal.x + 1.0)/2.0, (normal.y + 1.0)/2.0, (normal.z + 1.0)/2.0, 1.0);
        
        // Debug values
        // Uncomment to test different rendering modes
        //gl_FragColor = vec4(vUV, 0.0, 1.0); // Just show UV coordinates as colors
        //gl_FragColor = normalColor;          // Just show normals as colors
        //gl_FragColor = texColor;             // Just show texture (ignoring uUseTexture)
        
        // Normal operation
        gl_FragColor = uUseTexture ? texColor : normalColor;
    }
`;


export const sceneFSTextOld = `
    precision mediump float;

    uniform sampler2D uTexture;
    uniform bool uUseTexture;
    varying vec2 vUV;
    varying vec4 lightDir;
    varying vec2 uv;
    varying vec4 normal;

    void main () {
        vec4 baseColor;
        if (uUseTexture) {
            baseColor = texture2D(uTexture, vUV);
        } else {
            // Your existing color calculation
            baseColor = vec4((normal.x + 1.0)/2.0, (normal.y + 1.0)/2.0, (normal.z + 1.0)/2.0,1.0);
        }
        gl_FragColor = baseColor;
    }
`;

/*export const sceneFSText = `
    precision mediump float;

    varying vec4 lightDir;
    varying vec2 uv;
    varying vec4 normal;

    void main () {
        gl_FragColor = vec4((normal.x + 1.0)/2.0, (normal.y + 1.0)/2.0, (normal.z + 1.0)/2.0,1.0);
    }
`;*/



export const skeletonVSText = `
    precision mediump float;

    attribute vec3 vertPosition;
    attribute float boneIndex;

    varying float boneindex;
    varying float selectedboneindex;

    uniform float selectedBoneIndex;
    
    uniform mat4 mWorld;
    uniform mat4 mView;
    uniform mat4 mProj;

    uniform vec3 bTrans[64];
    uniform vec4 bRots[64];

    

    vec3 qtrans(vec4 q, vec3 v) {
        return v + 2.0 * cross(cross(v, q.xyz) - q.w*v, q.xyz);
    }

    void main () {
        int index = int(boneIndex);
        gl_Position = mProj * mView * mWorld * vec4(bTrans[index] + qtrans(bRots[index], vertPosition), 1.0);
        boneindex = boneIndex;
        selectedboneindex = selectedBoneIndex;
    }
`;

export const skeletonFSText = ` 
    precision mediump float;

    varying float boneindex;
    varying float selectedboneindex;

    void main () {
        
        if (boneindex == selectedboneindex) {
            gl_FragColor = vec4(0.0, 1.0, 1.0, 1.0);
        }
        else {
            gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
        }
    }
`;
	
export const sBackVSText = `
    precision mediump float;

    attribute vec2 vertPosition;

    varying vec2 uv;

    void main() {
        gl_Position = vec4(vertPosition, 0.0, 1.0);
        uv = vertPosition;
        uv.x = (1.0 + uv.x) / 2.0;
        uv.y = (1.0 + uv.y) / 2.0;
    }
`;

export const sBackFSText = `
    precision mediump float;

    varying vec2 uv;

    void main () {
        gl_FragColor = vec4(0.1, 0.1, 0.1, 1.0);
        if (abs(uv.y-.33) < .005 || abs(uv.y-.67) < .005) {
            gl_FragColor = vec4(1, 1, 1, 1);
        }
    }

`;



/*
export const sceneVSText = `
precision mediump float;
attribute vec3 vertPosition;
attribute vec2 aUV;
attribute vec3 aNorm;
attribute vec4 skinIndices;
attribute vec4 skinWeights;
//vertices used for bone weights (assumes up to four weights per vertex)
attribute vec3 v0;
attribute vec3 v1;
attribute vec3 v2;
attribute vec3 v3;

varying vec4 lightDir;
varying vec2 uv;
varying vec4 normal;

uniform vec4 lightPosition;
uniform mat4 mWorld;
uniform mat4 mView;
uniform mat4 mProj;

//Joint translations and rotations to determine weights (assumes up to 64 joints per rig)
uniform vec3 jTrans[64];
uniform vec4 jRots[64];

// Helper function to transform a point by a quaternion rotation

vec3 qtrans(vec4 q, vec3 v) {
    return v + 2.0 * cross(cross(v, q.xyz) - q.w*v, q.xyz);
}

vec4 quatMul(vec4 q1, vec4 q2){
    return vec4(
    q1.x * q2.w + q1.w * q2.x + q1.y * q2.z - q1.z * q2.y,
    q1.y * q2.w + q1.w * q2.y + q1.z * q2.x - q1.x * q2.z,
    q1.z * q2.w + q1.w * q2.z + q1.x * q2.y - q1.y * q2.x,
    q1.w * q2.w - q1.x * q2.x - q1.y * q2.y - q1.z * q2.z);

}
vec4 dualQuat(vec3 t, vec4 r) {
    vec4 translation = vec4(t.x, t.y, t.z, 0.0);
    vec4 i_part = quatMul(translation, r);
    return vec4((i_part.x/2.0), (i_part.y/2.0), (i_part.z/2.0), (i_part.w/2.0));
    
}
void main() {
    
    // Initialize deformed position
    vec4 real_skinning = vec4(0.0, 0.0, 0.0, 0.0);
    vec4 dual_skinning = vec4(0.0, 0.0, 0.0, 0.0);
    vec3 blendedLocalPos = vec3(0.0, 0.0, 0.0);
    if (skinWeights.x > 0.0) blendedLocalPos += v0 * skinWeights.x;
    if (skinWeights.y > 0.0) blendedLocalPos += v1 * skinWeights.y;
    if (skinWeights.z > 0.0) blendedLocalPos += v2 * skinWeights.z;
    if (skinWeights.w > 0.0) blendedLocalPos += v3 * skinWeights.w;
    
    // Get bone indices from skinIndices attribute
    int boneIndex0 = int(skinIndices.x);
    int boneIndex1 = int(skinIndices.y);
    int boneIndex2 = int(skinIndices.z);
    int boneIndex3 = int(skinIndices.w);

    vec4 q_real_0 = vec4(jRots[boneIndex0].x, jRots[boneIndex0].y, jRots[boneIndex0].z, jRots[boneIndex0].w);
    vec4 q_real_1 = vec4(jRots[boneIndex1].x, jRots[boneIndex1].y, jRots[boneIndex1].z, jRots[boneIndex1].w);   
    vec4 q_real_2 = vec4(jRots[boneIndex2].x, jRots[boneIndex2].y, jRots[boneIndex2].z, jRots[boneIndex2].w);
    vec4 q_real_3 = vec4(jRots[boneIndex3].x, jRots[boneIndex3].y, jRots[boneIndex3].z, jRots[boneIndex3].w);

    vec4 q_dual_0 = dualQuat(jTrans[boneIndex0], jRots[boneIndex0]);
    vec4 q_dual_1 = dualQuat(jTrans[boneIndex1], jRots[boneIndex1]);
    vec4 q_dual_2 = dualQuat(jTrans[boneIndex2], jRots[boneIndex2]);
    vec4 q_dual_3 = dualQuat(jTrans[boneIndex3], jRots[boneIndex3]);

        // Blend the first quaternion
    real_skinning = skinWeights.x * q_real_0;
    dual_skinning = skinWeights.x * q_dual_0;

    // Handle antipodality for subsequent quaternions
    float scale;

    // For the second weight
    if (skinWeights.y > 0.0) {
        scale = dot(real_skinning, q_real_1) < 0.0 ? -1.0 : 1.0;
        real_skinning += scale * skinWeights.y * q_real_1;
        dual_skinning += scale * skinWeights.y * q_dual_1;
    }

    // For the third weight
    if (skinWeights.z > 0.0) {
        scale = dot(real_skinning, q_real_2) < 0.0 ? -1.0 : 1.0;
        real_skinning += scale * skinWeights.z * q_real_2;
        dual_skinning += scale * skinWeights.z * q_dual_2;
    }

    // For the fourth weight
    if (skinWeights.w > 0.0) {
        scale = dot(real_skinning, q_real_3) < 0.0 ? -1.0 : 1.0;
        real_skinning += scale * skinWeights.w * q_real_3;
        dual_skinning += scale * skinWeights.w * q_dual_3;
    }

    
    real_skinning += skinWeights.x * q_real_0;
    dual_skinning += skinWeights.x * q_dual_0;

    real_skinning += skinWeights.y * q_real_1;
    dual_skinning += skinWeights.y * q_dual_1;

    real_skinning += skinWeights.z * q_real_2;
    dual_skinning += skinWeights.z * q_dual_2;

    real_skinning += skinWeights.w * q_real_3;
    dual_skinning += skinWeights.w * q_dual_3;
    
   float real_length = sqrt(real_skinning.x * real_skinning.x + real_skinning.y * real_skinning.y + real_skinning.z * real_skinning.z  + real_skinning.w * real_skinning.w);

    
    vec4 realPart = vec4(real_skinning.x / real_length, real_skinning.y / real_length, real_skinning.z / real_length, real_skinning.w / real_length);
    vec4 dualPart = vec4(dual_skinning.x/ real_length, dual_skinning.y / real_length, dual_skinning.z / real_length, dual_skinning.w / real_length);
    
    float t_zero = 2.0 * (-dualPart.w*realPart.x + dualPart.x*realPart.w - dualPart.y*realPart.z + dualPart.z*realPart.y);
    float t_one = 2.0 * (-dualPart.w*realPart.y + dualPart.x*realPart.z + dualPart.y*realPart.w - dualPart.z*realPart.x);
    float t_two = 2.0 * (-dualPart.w*realPart.z - dualPart.x*realPart.y + dualPart.y*realPart.x + dualPart.z*realPart.w);
    float m_one = 1.0 - 2.0 *(realPart.y*realPart.y) - 2.0 *(realPart.z*realPart.z);
    float m_two = 2.0 *(realPart.x*realPart.y) + 2.0 *(realPart.w*realPart.z);
    float m_three = 2.0 *(realPart.x*realPart.z) - 2.0 *(realPart.w*realPart.y);
    float m_four = 2.0 *(realPart.x * realPart.y) - 2.0 *(realPart.w * realPart.z);
    float m_five = 1.0 - 2.0 *(realPart.x*realPart.x) - 2.0 *(realPart.z*realPart.z);
    float m_six = 2.0 *(realPart.y*realPart.z) + 2.0 *(realPart.w*realPart.x);
    float m_seven = 2.0 *(realPart.x*realPart.z) + 2.0 *(realPart.w*realPart.y);
    float m_eight = 2.0 *(realPart.y*realPart.z) - 2.0 *(realPart.w*realPart.x);
    float m_nine = 1.0 - 2.0 *(realPart.x*realPart.x) - 2.0 *(realPart.y*realPart.y);

    vec4 row1  = vec4(m_one, m_four, m_seven, t_zero);
    vec4 row2  = vec4(m_two, m_five, m_eight, t_one);
    vec4 row3  = vec4(m_three, m_six, m_nine, t_two);


    //float v_row1 = dot(row1, vec4(lbsPosition.x, lbsPosition.y, lbsPosition.z, 1.0));
    //float v_row2 = dot(row2, vec4(lbsPosition.x, lbsPosition.y, lbsPosition.z, 1.0));
    //float v_row3 = dot(row3, vec4(lbsPosition.x, lbsPosition.y, lbsPosition.z, 1.0));

    float v_row1 = dot(row1, vec4(vertPosition.x, vertPosition.y, vertPosition.z, 1.0));
    float v_row2 = dot(row2, vec4(vertPosition.x, vertPosition.y, vertPosition.z, 1.0));
    float v_row3 = dot(row3, vec4(vertPosition.x, vertPosition.y, vertPosition.z, 1.0));

    vec4 finalPos = vec4(v_row1, v_row2, v_row3, 1.0);
    
    vec4 worldPosition = mWorld * finalPos;
    gl_Position = mProj * mView * worldPosition;
  
    lightDir = lightPosition - worldPosition;
    
    // Pass normal and UV to fragment shader
    normal = normalize(mWorld * vec4(aNorm, 0.0));
    uv = aUV;
}
`;
*/


/*export const sceneVSText = `
precision mediump float;
attribute vec3 vertPosition;
attribute vec2 aUV;
attribute vec3 aNorm;
attribute vec4 skinIndices;
attribute vec4 skinWeights;
//vertices used for bone weights (assumes up to four weights per vertex)
attribute vec3 v0;
attribute vec3 v1;
attribute vec3 v2;
attribute vec3 v3;

varying vec4 lightDir;
varying vec2 uv;
varying vec4 normal;

uniform vec4 lightPosition;
uniform mat4 mWorld;
uniform mat4 mView;
uniform mat4 mProj;

//Joint translations and rotations to determine weights (assumes up to 64 joints per rig)
uniform vec3 jTrans[64];
uniform vec4 jRots[64];

// Helper function to transform a point by a quaternion rotation
vec3 qtrans(vec4 q, vec3 v) {
    return v + 2.0 * cross(cross(v, q.xyz) - q.w*v, q.xyz);
}

void main() {
    // Initialize deformed position
    vec3 skinnedPosition = vec3(0.0, 0.0, 0.0);
    
    // Get bone indices from skinIndices attribute
    int boneIndex0 = int(skinIndices.x);
    int boneIndex1 = int(skinIndices.y);
    int boneIndex2 = int(skinIndices.z);
    int boneIndex3 = int(skinIndices.w);
    
    vec3 transformed0 = jTrans[boneIndex0] + qtrans(jRots[boneIndex0], v0);
    skinnedPosition += skinWeights.x * transformed0;
    
    vec3 transformed1 = jTrans[boneIndex1] + qtrans(jRots[boneIndex1], v1);
    skinnedPosition += skinWeights.y * transformed1;
    
    vec3 transformed2 = jTrans[boneIndex2] + qtrans(jRots[boneIndex2], v2);
    skinnedPosition += skinWeights.z * transformed2;
    
    vec3 transformed3 = jTrans[boneIndex3] + qtrans(jRots[boneIndex3], v3);
    skinnedPosition += skinWeights.w * transformed3;
    
    vec4 worldPosition = mWorld * vec4(skinnedPosition, 1.0);
    gl_Position = mProj * mView * worldPosition;
  
    lightDir = lightPosition - worldPosition;
    
    // Pass normal and UV to fragment shader
    normal = normalize(mWorld * vec4(aNorm, 0.0));
    uv = aUV;
}
`;*/

