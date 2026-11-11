import { Mat4, Mat3, Quat, Vec3, Vec4 } from "../lib/TSM.js";
import { AttributeLoader, MeshGeometryLoader, BoneLoader, MeshLoader } from "./AnimationFileLoader.js";

//TODO: Generate cylinder geometry for highlighting bones

//General class for handling GLSL attributes
export class Attribute {
  values: Float32Array;
  count: number;
  itemSize: number;

  constructor(attr: AttributeLoader) {
    this.values = attr.values;
    this.count = attr.count;
    this.itemSize = attr.itemSize;
  }
}

//Class for handling mesh vertices and skin weights
export class MeshGeometry {
  position: Attribute;
  normal: Attribute;
  uv: Attribute | null;
  skinIndex: Attribute; // bones indices that affect each vertex
  skinWeight: Attribute; // weight of associated bone
  v0: Attribute; // position of each vertex of the mesh *in the coordinate system of bone skinIndex[0]'s joint*. Perhaps useful for LBS.
  v1: Attribute;
  v2: Attribute;
  v3: Attribute;

  constructor(mesh: MeshGeometryLoader) {
    this.position = new Attribute(mesh.position);
    this.normal = new Attribute(mesh.normal);
    if (mesh.uv) { this.uv = new Attribute(mesh.uv); }
    this.skinIndex = new Attribute(mesh.skinIndex);
    this.skinWeight = new Attribute(mesh.skinWeight);
    this.v0 = new Attribute(mesh.v0);
    this.v1 = new Attribute(mesh.v1);
    this.v2 = new Attribute(mesh.v2);
    this.v3 = new Attribute(mesh.v3);
  }
}

//Class for handling bones in the skeleton rig
export class Bone {
  //public parent: number;
  //public children: number[];
  public selected: Boolean = false;
  public parent!: Bone;
  public parentIndex: number;
  public children: Bone[] = [];      
  private childIndices: number[];
  public index: number;
  public ogPosition: Vec4; 
  public ogEndpoint: Vec4;
  public ogEndpoint2: Vec4;
  public ogPosition2: Vec4;
  public position: Vec3; // current position of the bone's joint *in world coordinates*. Used by the provided skeleton shader, so you need to keep this up to date.
  public endpoint: Vec3; // current position of the bone's second (non-joint) endpoint, in world coordinates
  public rotation: Quat; // current orientation of the joint *with respect to world coordinates*
  public dMat: Mat4;
  public tMat: Mat4;
  public rotationMat : Mat4;


  constructor(bone: BoneLoader) {
    //this.parent = bone.parent;
    //this.children = Array.from(bone.children);

    this.parentIndex = bone.parent;
    this.childIndices = Array.from(bone.children);
    this.children = [];
    this.position = bone.position.copy();
    this.endpoint = bone.endpoint.copy();
    this.rotation = bone.rotation.copy();
    this.rotationMat = new Mat4().setIdentity();
  }

  public printMat4(matrix: Mat4) {
    for (let i = 0; i < 16; i++) {
      let row = "";
        row += matrix.at(i).toFixed(4) + "\t";
      console.log(row);
    }
  }

  public boneTranslation(translate: Vec3): void {
  
    // Store the rotation matrix
    //this.position = this.position.copy().add(translate);
    //this.endpoint = this.endpoint.copy().add(translate);
  
    if (this.parentIndex == -1) {
      // Root bone 
      this.tMat = new Mat4([
        1.0, 0.0, 0.0, 0.0,
        0.0, 1.0, 0.0, 0.0,
        0.0, 0.0, 1.0, 0.0,
        this.position.x + translate.x, this.position.y + translate.y, this.position.z + translate.z, 1.0]);
      
        /*this.dMat = new Mat4([
          this.dMat.at(0), this.dMat.at(4), this.dMat.at(8), 0.0,
          this.dMat.at(1), this.dMat.at(5), this.dMat.at(9), 0.0,
          this.dMat.at(2), this.dMat.at(6), this.dMat.at(10), 0.0,
          this.dMat.at(3)+translate.x, this.dMat.at(7)+translate.y, this.dMat.at(11)+translate.z, 1.0]);*/
          this.dMat = this.tMat.multiply(this.rotationMat);
        console.log("translated parent dmat: ");
        this.printMat4(this.dMat);
    } else {
      // Non-root bone
      this.dMat = this.parent.dMat.copy().multiply(this.tMat).multiply(this.rotationMat);
    }

    this.rotation = this.dMat.copy().toMat3().toQuat();
  
    this.printMat4(this.dMat);
  
    // Update position and endpoint
    //const length = this.endpoint.copy().subtract(this.position).length();
    this.position = new Vec3(this.dMat.copy().multiplyVec4(this.ogPosition).xyz);
    this.endpoint = new Vec3(this.dMat.copy().multiplyVec4(this.ogEndpoint).xyz);

  
    // Propagate changes to children
    for (let i = 0; i < this.children.length; i++) {
      this.children[i].boneTranslation(new Vec3([0, 0, 0]));
    }
  }

  public boneRotation(rotation: Mat4): void {
  
    // Store the rotation matrix
    this.rotationMat = rotation.copy().multiply(this.rotationMat);
    this.ogEndpoint2 = rotation.copy().multiplyVec4(this.ogEndpoint2);
    this.ogPosition2 = rotation.copy().multiplyVec4(this.ogPosition2);
    this.printMat4(this.rotationMat);
  

  
    if (this.parentIndex == -1) {
      // Root bone
      this.dMat = this.tMat.copy().multiply(this.rotationMat);
    } else {
      // Non-root bone
      this.dMat = this.parent.dMat.copy().multiply(this.tMat).multiply(this.rotationMat);
    }

    this.rotation = this.dMat.copy().toMat3().toQuat();
  
    this.printMat4(this.dMat);
  
    // Update position and endpoint
    //const length = this.endpoint.copy().subtract(this.position).length();
    this.position = new Vec3(this.dMat.copy().multiplyVec4(this.ogPosition).xyz);
    this.endpoint = new Vec3(this.dMat.copy().multiplyVec4(this.ogEndpoint).xyz);

  
    // Propagate changes to children
    for (let i = 0; i < this.children.length; i++) {
      this.children[i].boneRotation(new Mat4().setIdentity());
    }
  }
  
  public keyframeRotation(rotation: Mat3): void {
  
    this.dMat = new Mat4([
      rotation.at(0), rotation.at(3), rotation.at(6), 0.0,
      rotation.at(1), rotation.at(4), rotation.at(7), 0.0,
      rotation.at(2), rotation.at(5), rotation.at(8), 0.0,
      this.dMat.at(3), this.dMat.at(7), this.dMat.at(11), 1.0]);

    this.rotation = rotation.toQuat();
  
    // Update position and endpoint
    //const length = this.endpoint.copy().subtract(this.position).length();
    this.position = new Vec3(this.dMat.copy().multiplyVec4(this.ogPosition).xyz);
    this.endpoint = new Vec3(this.dMat.copy().multiplyVec4(this.ogEndpoint).xyz);
  }
  

  public rotate(axis: Vec3, radians: number, pos?: Vec3): Mat4 {
    // TODO: add preconditions and checks for small angles or axis
    console.assert(axis != null);
    console.assert(radians != null);
    
    if(Number.isNaN(axis.length()) || axis.length() == 0.0)
        return new Mat4().setIdentity();
    
    axis.normalize();

    // Compute rotation matrix
    const rotMat: Mat4 = new Mat4().setIdentity();
    rotMat.rotate(radians, axis);
    return rotMat;
  }
}

//Class for handling the overall mesh and rig
export class Mesh {
  public geometry: MeshGeometry;
  public worldMatrix: Mat4; // in this project all meshes and rigs have been transformed into world coordinates for you
  public rotation: Vec3;
  public bones: Bone[];

  public keyframeRotations: Mat4[][] = [];

  public rootBone: Bone[];
  public materialName: string;
  public imgSrc: String | null;

  private boneIndices: number[];
  private bonePositions: Float32Array;
  private boneIndexAttribute: Float32Array;

  constructor(mesh: MeshLoader) {
    this.geometry = new MeshGeometry(mesh.geometry);
    this.worldMatrix = mesh.worldMatrix.copy();
    this.rotation = mesh.rotation.copy();

    this.bones = [];
    this.rootBone = [];
    mesh.bones.forEach(bone => {
      let curr : Bone = new Bone(bone);
      this.bones.push(curr);
      //init ogpos and ogned to be in local
      curr.ogPosition = new Vec4([0.0, 0.0, 0.0, 1.0]);
      curr.ogPosition2 = new Vec4([0.0, 0.0, 0.0, 1.0]);
      curr.ogEndpoint = new Vec4([curr.endpoint.copy().subtract(curr.position.copy()).x, curr.endpoint.copy().subtract(curr.position.copy()).y, curr.endpoint.copy().subtract(curr.position.copy()).z, 1.0]);
      curr.ogEndpoint2 = new Vec4([curr.endpoint.copy().subtract(curr.position.copy()).x, curr.endpoint.copy().subtract(curr.position.copy()).y, curr.endpoint.copy().subtract(curr.position.copy()).z, 1.0]);
    });


    
    this.bones.forEach((bone, index) => {
      if (bone.parentIndex >= 0) {
        const parentBone = this.bones[bone.parentIndex];
        bone.parent = parentBone;
        parentBone.children.push(bone);
        
        bone.index = index;
        
        bone.tMat = new Mat4([
          1.0, 0.0, 0.0, 0.0,
          0.0, 1.0, 0.0, 0.0,
          0.0, 0.0, 1.0, 0.0,
          bone.position.x - bone.parent.position.x, bone.position.y - bone.parent.position.y, bone.position.z - bone.parent.position.z, 1.0]);
          
        
      } else {
        this.rootBone.push(bone);
        bone.parent = bone;  
        bone.index = index;

        bone.tMat = new Mat4([
          1.0, 0.0, 0.0, 0.0,
          0.0, 1.0, 0.0, 0.0,
          0.0, 0.0, 1.0, 0.0,
          bone.position.x, bone.position.y, bone.position.z, 1.0]);
        
          bone.dMat = new Mat4([
            1.0, 0.0, 0.0, 0.0,
            0.0, 1.0, 0.0, 0.0,
            0.0, 0.0, 1.0, 0.0,
            bone.position.x, bone.position.y, bone.position.z, 1.0]);
      }
  });

  this.rootBone.forEach((bone, index) => {
    // Add logic here if needed, or remove this line if unnecessary
    const stack: Bone[] = [bone];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current.parentIndex >= 0) {
        current.dMat = current.parent.dMat.copy().multiply(current.tMat.copy());
      }
 
      for (let i = current.children.length - 1; i >= 0; i--) {
        stack.push(current.children[i]);
      }
    }
  });
  


    this.materialName = mesh.materialName;
    this.imgSrc = null;
    this.boneIndices = Array.from(mesh.boneIndices);
    this.bonePositions = new Float32Array(mesh.bonePositions);
    this.boneIndexAttribute = new Float32Array(mesh.boneIndexAttribute);
  }

  public async slerpFrames(
    key1: Mat4[], 
    key2: Mat4[], 
    animationState: { running: boolean }, duration: number): Promise<boolean> {
    if (!animationState.running) return false;
    
    const DURATION_MS = duration;
    const STEPS = 60;
    const startTime = performance.now();

    while (performance.now() - startTime <= DURATION_MS) {
      if (!animationState.running) return false;
      
      // Calculate precise elapsed time
      const currentTime = performance.now();
      const t = Math.min((currentTime - startTime) / DURATION_MS, 1);
      
      // Update bones using accurate t
      this.bones.forEach((bone, index) => {
        const rot = Quat.slerpShort(
          key1[index].toMat3().toQuat(),
          key2[index].toMat3().toQuat(),
          t
        ).toMat4();
        bone.rotationMat = rot.copy();
      });

      
      this.rootBone.forEach((bone, index) => {
        bone.boneRotation(new Mat4().setIdentity());
      });
  
      // Calculate remaining time until next frame
      const nextFrameTime = currentTime + (DURATION_MS / STEPS);
      const sleepTime = nextFrameTime - performance.now();
      
      if (sleepTime > 0) {
        await new Promise(resolve => 
          setTimeout(resolve, sleepTime)
        );
      }
    }
    
    return true;
  }
  

  // TODO: Create functionality for bone manipulation/key-framing
  // public async slerpFrames2(key1: Mat4[], key2: Mat4[], animationState: {running: boolean}): Promise<boolean> {
  //   // If animation isn't running, exit immediately
  //   if (!animationState.running) {
  //     return false;
  //   }
    
  //   const DURATION_MS = 1000; // Exactly 1 second per keyframe
  //   const STEPS = 24; // 24fps for smooth animation
  //   const STEP_TIME_MS = DURATION_MS / STEPS;
  //   const sleep = (ms: number): Promise<void> => {
  //     return new Promise(resolve => setTimeout(resolve, ms));
  //   };
    
  //   // For each interpolation step
  //   for (let step = 0; step <= STEPS; step++) {
  //     // Check if animation should be aborted - this needs to be checked each step
  //     if (!animationState.running) {
  //       return false; // Animation was aborted, but we keep the current pose
  //     }
      
  //     // Calculate interpolation factor (0 to 1)
  //     const t = step / STEPS;
  //     // Update all bones at this interpolation step
  //     this.bones.forEach((bone, index) => {
  //       let rot: Mat4 = Quat.slerpShort(
  //         key1[index].toMat3().toQuat(),
  //         key2[index].toMat3().toQuat(),
  //         t
  //       ).toMat4();
  //       bone.rotationMat = rot.copy();
  //     });
  //     this.rootBone.forEach((bone, index) => {
  //       bone.boneRotation(new Mat4().setIdentity());
  //     });
      
  //     // Wait before moving to the next interpolation step (except on last frame)
  //     if (step < STEPS) {
  //       await sleep(STEP_TIME_MS);
        
  //       // Check again after sleep if animation should be aborted
  //       if (!animationState.running) {
  //         return false; // Animation was aborted during sleep, but keep current pose
  //       }
  //     }
  //   }
    
  //   return true; // Animation completed successfully
  // }

  
  

  public getBoneIndices(): Uint32Array {
    return new Uint32Array(this.boneIndices);
  }

  public getBonePositions(): Float32Array {
    return this.bonePositions;
  }

  public getBoneIndexAttribute(): Float32Array {
    return this.boneIndexAttribute;
  }

  public getBoneTranslations(): Float32Array {
    let trans = new Float32Array(3 * this.bones.length);
    this.bones.forEach((bone, index) => {
      let res = bone.position.xyz;
      for (let i = 0; i < res.length; i++) {
        trans[3 * index + i] = res[i];
      }
    });
    return trans;
  }

  public getBoneRotations(): Float32Array {
    let trans = new Float32Array(4 * this.bones.length);
    this.bones.forEach((bone, index) => {
      let res = bone.rotation.xyzw;
      for (let i = 0; i < res.length; i++) {
        trans[4 * index + i] = res[i];
      }
    });
    return trans;
  }

  public static generateBoneCylinder(position: Vec3, endpoint: Vec3, radius: number = 0.1): {positions: Float32Array, indices: Uint32Array} {
    const segments = 6; // Hexagon
    const length = Vec3.distance(position, endpoint);
    const axis = Vec3.difference(endpoint, position).normalize();
    
    // Generate hexagon points
    const hexVertices: Vec3[] = [];
    const angleStep = (2 * Math.PI) / segments;
    
    // Create rotation matrix to align with bone direction
    const up = new Vec3([0, 1, 0]);
    const rotationAxis = Vec3.cross(up, axis).normalize();
    const rotationAngle = Math.acos(Vec3.dot(up, axis));
    const rotation = Quat.fromAxisAngle(rotationAxis, rotationAngle);
    
    // Generate two hexagons (start and end)
    for (let i = 0; i < 2; i++) {
        const height = i * length;
        for (let j = 0; j < segments; j++) {
            const angle = angleStep * j;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            let vert = new Vec3([x, height, z]);
            vert = rotation.multiplyVec3(vert);
            hexVertices.push(vert.add(position));
        }
    }

    // Generate lines
    const indices: number[] = [];
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    
    // Top hexagon
    indices.push(i, next);
    // Bottom hexagon
    indices.push(segments + i, segments + next);
    // Vertical lines
    indices.push(i, segments + i);
  }

    // Flatten positions
    const positions = new Float32Array(hexVertices.length * 3);
    hexVertices.forEach((v, i) => {
        positions[i*3] = v.x;
        positions[i*3 + 1] = v.y;
        positions[i*3 + 2] = v.z;
    });

    return {
        positions: positions,
        indices: new Uint32Array(indices)
    };
}
}