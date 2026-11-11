import { Debugger } from "../lib/webglutils/Debugging.js";
import {
  CanvasAnimation,
  WebGLUtilities
} from "../lib/webglutils/CanvasAnimation.js";
import { Floor } from "../lib/webglutils/Floor.js";
import { GUI, Mode } from "./Gui.js";
import { Mesh } from "./Scene.js";
import { Water } from "./Water.js";
import {
  sceneFSText,
  sceneVSText,
  floorFSText,
  floorVSText,
  skeletonFSText,
  skeletonVSText,
  sBackVSText,
  sBackFSText,
  waterFSText,
  waterVSText
} from "./Shaders.js";
import { Mat4, Vec4, Vec3 } from "../lib/TSM.js";
import { CLoader } from "./AnimationFileLoader.js";
import { RenderPass } from "../lib/webglutils/RenderPass.js";
import { Camera } from "../lib/webglutils/Camera.js";

export class SkinningAnimation extends CanvasAnimation {
  private gui: GUI;
  private millis: number;

  private loadedScene: string;


  public water: Water = new Water();
  private waterVAO: WebGLVertexArrayObjectOES = -1;
  private waterProgram: WebGLProgram = -1;
  private waterPosBuffer: WebGLBuffer = -1;
  private waterIndexBuffer: WebGLBuffer = -1;
  private waterNormBuffer: WebGLBuffer = -1;

  private waterPosAttribLoc: GLint = -1; //floor
  private waterNormAttribLoc: GLint = -1; //floor

  private waterWorldUniformLocation: WebGLUniformLocation = -1;
  private waterViewUniformLocation: WebGLUniformLocation = -1;
  private waterProjUniformLocation: WebGLUniformLocation = -1;
  private waterLightUniformLocation: WebGLUniformLocation = -1;

  /* Scene rendering info */
  private scene: CLoader;
  private sceneRenderPass: RenderPass;
  private modelTexture: WebGLTexture | null = null;
  private textureLoaded: boolean = false;

  /* Scrub bar background rendering info */
  private sBackRenderPass: RenderPass;
  
  /* Global Rendering Info */
  private lightPosition: Vec4;
  private backgroundColor: Vec4;

  private canvas2d: HTMLCanvasElement;
  private ctx2: CanvasRenderingContext2D | null;


  constructor(canvas: HTMLCanvasElement) {
    super(canvas);

    this.canvas2d = document.getElementById("textCanvas") as HTMLCanvasElement;
    this.ctx2 = this.canvas2d.getContext("2d");
    if (this.ctx2) {
      this.ctx2.font = "25px serif";
      this.ctx2.fillStyle = "#ffffffff";
    }

    this.ctx = Debugger.makeDebugContext(this.ctx);
    let gl = this.ctx;

    this.sceneRenderPass = new RenderPass(this.extVAO, gl, sceneVSText, sceneFSText);

	//TODO: Add in other rendering initializations for other shaders such as bone highlighting

    this.gui = new GUI(this.canvas2d, this);
    this.lightPosition = new Vec4([-10, 10, -10, 1]);
    this.backgroundColor = new Vec4([0.5, 0.65, 0.8, 1.0]);

    this.initWater();
    this.scene = new CLoader("");

    // Status bar
    this.sBackRenderPass = new RenderPass(this.extVAO, gl, sBackVSText, sBackFSText);
    
    this.initGui();
	
    this.millis = new Date().getTime();
  }


  public getScene(): CLoader {
    return this.scene;
  }

  /**
   * Setup the animation. This can be called again to reset the animation.
   */
  public reset(): void {
      this.gui.reset();
      this.setScene(this.loadedScene);
  }

  public initGui(): void {
    
    // Status bar background
    let verts = new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]);
    this.sBackRenderPass.setIndexBufferData(new Uint32Array([1, 0, 2, 2, 0, 3]))
    this.sBackRenderPass.addAttribute("vertPosition", 2, this.ctx.FLOAT, false,
      2 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, verts);

    this.sBackRenderPass.setDrawData(this.ctx.TRIANGLES, 6, this.ctx.UNSIGNED_INT, 0);
    this.sBackRenderPass.setup();

    }

  public initScene(): void {
    if (this.scene.meshes.length === 0) { return; }
    this.initModel();
    this.getGUI().duration.duration = 250;
    this.getScene().meshes[0].keyframeRotations = [[]];
    this.getScene().meshes[0].rootBone.forEach((bone, index) => {
      bone.boneRotation(new Mat4().setIdentity());
      bone.boneTranslation(new Vec3([0.0, 3, 0]));
    });
    this.gui.reset();
  }

/**
 * Sets up the mesh and mesh drawing
 */
public initModel(): void {
  this.sceneRenderPass = new RenderPass(this.extVAO, this.ctx, sceneVSText, sceneFSText);
  let faceCount = this.scene.meshes[0].geometry.position.count / 3;
  let fIndices = new Uint32Array(faceCount * 3);
  for (let i = 0; i < faceCount * 3; i += 3) {
      fIndices[i] = i;
      fIndices[i + 1] = i + 1;
      fIndices[i + 2] = i + 2;
  }
  
  this.sceneRenderPass.setIndexBufferData(fIndices);
  //vertPosition is a placeholder value until skinning is in place
  this.sceneRenderPass.addAttribute("vertPosition", 3, this.ctx.FLOAT, false,
      3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].geometry.position.values);
  this.sceneRenderPass.addAttribute("aNorm", 3, this.ctx.FLOAT, false,
      3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].geometry.normal.values);
  
  // Debug UV coordinates
  if (this.scene.meshes[0].geometry.uv) {
      console.log("UV data found:", this.scene.meshes[0].geometry.uv.values.length, "values");
      // Log a few UV values to verify they look reasonable (should be between 0-1)
      console.log("Sample UV values:", 
          this.scene.meshes[0].geometry.uv.values.slice(0, 10));
          
      this.sceneRenderPass.addAttribute("aUV", 2, this.ctx.FLOAT, false,
          2 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].geometry.uv.values);
  } else {
      console.warn("No UV coordinates found for this mesh!");
      // Create default UVs (might not map correctly but prevents errors)
      this.sceneRenderPass.addAttribute("aUV", 2, this.ctx.FLOAT, false,
          2 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, new Float32Array(this.scene.meshes[0].geometry.position.values.length / 3 * 2));
  }
  
  //Note that these attributes will error until you use them in the shader
  this.sceneRenderPass.addAttribute("skinIndices", 4, this.ctx.FLOAT, false,
      4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].geometry.skinIndex.values);
  this.sceneRenderPass.addAttribute("skinWeights", 4, this.ctx.FLOAT, false,
      4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].geometry.skinWeight.values);
  this.sceneRenderPass.addAttribute("v0", 3, this.ctx.FLOAT, false,
      3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].geometry.v0.values);
  this.sceneRenderPass.addAttribute("v1", 3, this.ctx.FLOAT, false,
      3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].geometry.v1.values);
  this.sceneRenderPass.addAttribute("v2", 3, this.ctx.FLOAT, false,
      3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].geometry.v2.values);
  this.sceneRenderPass.addAttribute("v3", 3, this.ctx.FLOAT, false,
      3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].geometry.v3.values);
  
  this.sceneRenderPass.addUniform("lightPosition",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
          gl.uniform4fv(loc, this.lightPosition.xyzw);
      });
  this.sceneRenderPass.addUniform("mWorld",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
          gl.uniformMatrix4fv(loc, false, new Float32Array(new Mat4().setIdentity().all()));
      });
  this.sceneRenderPass.addUniform("mProj",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
          gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.projMatrix().all()));
      });
  this.sceneRenderPass.addUniform("mView",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
          gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.viewMatrix().all()));
      });
  this.sceneRenderPass.addUniform("jTrans",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
          gl.uniform3fv(loc, this.scene.meshes[0].getBoneTranslations());
      });
  this.sceneRenderPass.addUniform("jRots",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
          gl.uniform4fv(loc, this.scene.meshes[0].getBoneRotations());
      });

  // Store texture-related properties on the class
  this.modelTexture = null;
  this.textureLoaded = false;
  
  // Register the texture uniforms
  this.sceneRenderPass.addUniform("uTexture", 
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
          if (loc) {
              gl.activeTexture(gl.TEXTURE0);
              gl.bindTexture(gl.TEXTURE_2D, this.modelTexture);
              gl.uniform1i(loc, 0);
          }
      });
      
  this.sceneRenderPass.addUniform("uUseTexture", 
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
          if (loc) {
              gl.uniform1i(loc, this.textureLoaded ? 1 : 0);
              //console.log(`Setting uUseTexture to ${this.textureLoaded ? 1 : 0}`);
          }
      });
  
  // Complete the shader setup first
  this.sceneRenderPass.setDrawData(this.ctx.TRIANGLES, this.scene.meshes[0].geometry.position.count, this.ctx.UNSIGNED_INT, 0);
  this.sceneRenderPass.setup();
  
  // Load the texture if available
  if (this.scene.meshes[0].imgSrc) {
      const texturePath = this.scene.meshes[0].imgSrc.toString();
      console.log("Loading texture from:", texturePath);
      
      // Create an image element
      const image = new Image();
      image.crossOrigin = "anonymous";
      
      // When image loads, create and set up WebGL texture
      image.onload = () => {
          console.log(`Texture loaded successfully: ${image.width}x${image.height}`);
          const gl = this.ctx;
          
          // Create and set up the texture
          this.modelTexture = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, this.modelTexture);
          
          // Upload the image data to the texture
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
          
          // Set texture parameters
          if (isPowerOf2(image.width) && isPowerOf2(image.height)) {
              console.log("Using mipmaps for power-of-2 texture");
              gl.generateMipmap(gl.TEXTURE_2D);
              gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
              gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          } else {
              console.log("Using non-power-of-2 texture settings");
              gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
              gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
              gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
              gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          }
          
          // Mark texture as loaded
          this.textureLoaded = true;
          console.log("Texture ready for rendering");
          
          // Force redraw with new texture
          this.draw();
      };
      
      // Handle loading errors
      image.onerror = (err) => {
          console.error("Failed to load texture:", texturePath, err);
          this.textureLoaded = false;
      };
      
      // Begin loading the image
      image.src = texturePath;
  } else {
      console.log("No texture path found for this model");
      this.textureLoaded = false;
  }
  
  // Helper function for texture sizing
  function isPowerOf2(value: number): boolean {
      return (value & (value - 1)) === 0;
  }
}

  public initWater(): void {
    this.water.initWaterGeometry();
    const gl: WebGLRenderingContext = this.ctx;

    /* Compile Shaders */
    this.waterProgram = WebGLUtilities.createProgram(
      gl,
      waterVSText,
      waterFSText
    );
    gl.useProgram(this.waterProgram);

    /* Create VAO for Floor */
    this.waterVAO = this.extVAO.createVertexArrayOES() as WebGLVertexArrayObjectOES;
    this.extVAO.bindVertexArrayOES(this.waterVAO);

    /* Create and setup positions buffer*/
    this.waterPosAttribLoc = gl.getAttribLocation(
      this.waterProgram,
      "vertPosition"
    );
    this.waterPosBuffer = gl.createBuffer() as WebGLBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.waterPosBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.water.floorPositionsFlat(), gl.DYNAMIC_DRAW); // Changed to DYNAMIC_DRAW
    gl.vertexAttribPointer(
      this.waterPosAttribLoc,
      4,
      gl.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0
    );
    gl.enableVertexAttribArray(this.waterPosAttribLoc);

    /* Create and setup normals buffer*/
    this.waterNormAttribLoc = gl.getAttribLocation(
      this.waterProgram,
      "aNorm"
    );
    this.waterNormBuffer = gl.createBuffer() as WebGLBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.waterNormBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.water.floorNormalsFlat(), gl.DYNAMIC_DRAW); // Changed to DYNAMIC_DRAW
    gl.vertexAttribPointer(
      this.waterNormAttribLoc,
      4,
      gl.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0
    );
    gl.enableVertexAttribArray(this.waterNormAttribLoc);

    /* Create and setup index buffer*/
    this.waterIndexBuffer = gl.createBuffer() as WebGLBuffer;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.waterIndexBuffer);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      this.water.floorIndicesFlat(),
      gl.STATIC_DRAW
    );

    /* End VAO recording */
    this.extVAO.bindVertexArrayOES(this.waterVAO);

    /* Get uniform locations */
    this.waterWorldUniformLocation = gl.getUniformLocation(
      this.waterProgram,
      "mWorld"
    ) as WebGLUniformLocation;
    this.waterViewUniformLocation = gl.getUniformLocation(
      this.waterProgram,
      "mView"
    ) as WebGLUniformLocation;
    this.waterProjUniformLocation = gl.getUniformLocation(
      this.waterProgram,
      "mProj"
    ) as WebGLUniformLocation;
    this.waterLightUniformLocation = gl.getUniformLocation(
      this.waterProgram,
      "lightPosition"
    ) as WebGLUniformLocation;

    /* Bind uniforms */
    gl.uniformMatrix4fv(
      this.waterWorldUniformLocation,
      false,
      new Float32Array(this.water.uMatrix().all())
    );
    gl.uniformMatrix4fv(
      this.waterViewUniformLocation,
      false,
      new Float32Array(Mat4.identity.all())
    );
    gl.uniformMatrix4fv(
      this.waterProjUniformLocation,
      false,
      new Float32Array(Mat4.identity.all())
    );
    gl.uniform4fv(this.waterLightUniformLocation, this.lightPosition.xyzw);


  }


  /** @internal
   * Draws a single frame
   *
   */
  // Modified draw method in App.ts to fix water rendering

public draw(): void {
  this.water.simulateWater();
  let curr = new Date().getTime();
  let deltaT = curr - this.millis;
  this.millis = curr;
  deltaT /= 1000;
  this.getGUI().incrementTime(deltaT);

  if (this.ctx2) {
    this.ctx2.clearRect(0, 0, this.ctx2.canvas.width, this.ctx2.canvas.height);
    if (this.scene.meshes.length > 0) {
      this.ctx2.fillText(this.getGUI().getModeString(), 50, 710);
    }
  }


  // Drawing
  const gl: WebGLRenderingContext = this.ctx;
  const bg: Vec4 = this.backgroundColor;
  gl.clearColor(bg.r, bg.g, bg.b, bg.a);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.CULL_FACE);
  gl.enable(gl.DEPTH_TEST);
  gl.frontFace(gl.CCW);
  gl.cullFace(gl.BACK);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null); // null is the default frame buffer
  
  // Draw the main scene in the main viewport
  this.drawScene(0, 200, 800, 600);    

  /* Draw status bar */
  if (this.scene.meshes.length > 0) {
    gl.viewport(0, 0, 800, 200);
    this.sBackRenderPass.draw();      
  }
  
  // IMPORTANT: Reset viewport to scene area before drawing water
  gl.viewport(0, 200, 800, 600);
  
  const modelMatrix = this.water.uMatrix();
  
  gl.useProgram(this.waterProgram);
  this.extVAO.bindVertexArrayOES(this.waterVAO);

  // Always update the water buffers to reflect simulation changes
  gl.bindBuffer(gl.ARRAY_BUFFER, this.waterPosBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    this.water.floorPositionsFlat(),
    gl.DYNAMIC_DRAW
  );
  gl.vertexAttribPointer(
    this.waterPosAttribLoc,
    4,
    gl.FLOAT,
    false,
    4 * Float32Array.BYTES_PER_ELEMENT,
    0
  );
  gl.enableVertexAttribArray(this.waterPosAttribLoc);

  gl.bindBuffer(gl.ARRAY_BUFFER, this.waterNormBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER, 
    this.water.floorNormalsFlat(), 
    gl.DYNAMIC_DRAW
  );
  gl.vertexAttribPointer(
    this.waterNormAttribLoc,
    4,
    gl.FLOAT,
    false,
    4 * Float32Array.BYTES_PER_ELEMENT,
    0
  );
  gl.enableVertexAttribArray(this.waterNormAttribLoc);

  /* Update water uniforms */
  gl.uniformMatrix4fv(
    this.waterWorldUniformLocation,
    false,
    new Float32Array(modelMatrix.all())
  );
  gl.uniformMatrix4fv(
    this.waterViewUniformLocation,
    false,
    new Float32Array(this.gui.viewMatrix().all())
  );
  gl.uniformMatrix4fv(
    this.waterProjUniformLocation,
    false,
    new Float32Array(this.gui.projMatrix().all())
  );
  
  gl.uniform4fv(this.waterLightUniformLocation, this.lightPosition.xyzw);
  
  // Draw the water surface
  gl.drawElements(
    gl.TRIANGLES, 
    this.water.floorIndicesFlat().length, 
    gl.UNSIGNED_INT, 
    0
  );
}

  private drawScene(x: number, y: number, width: number, height: number): void {
    const gl: WebGLRenderingContext = this.ctx;
    gl.viewport(x, y, width, height);

    /* Draw Scene */
    if (this.scene.meshes.length > 0) {
      this.sceneRenderPass.draw();
      this.getScene().meshes[0].rootBone.forEach((bone, index) => {
        bone.boneRotation(new Mat4().setIdentity());
        if (bone.endpoint.y - 1.5 > this.water.getWaterHeightAt(bone.endpoint.x, bone.endpoint.z)) {
          bone.boneTranslation(new Vec3([0.0, -0.025, 0.0]));
        }
        else {
          if (this.getGUI().lifeCount-1 <= 0) {
            this.getGUI().lifeCount=0;
            this.getGUI().status = "GAMEOVER! Press R to restart.";
          }
          else {
            this.getGUI().lifeCount-=1;
            bone.boneTranslation(new Vec3([0.0, 5, 0.0]));
          }
        }
      });
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.DEPTH_TEST);      
    }
  }

  public getGUI(): GUI {
    return this.gui;
  }
  
  /**
   * Loads and sets the scene from a Collada file
   * @param fileLocation URI for the Collada file
   */
  public setScene(fileLocation: string): void {
    this.loadedScene = fileLocation;
    this.scene = new CLoader(fileLocation);
    this.scene.load(() => this.initScene());
  }
}

export function initializeCanvas(): void {
  const canvas = document.getElementById("glCanvas") as HTMLCanvasElement;
  /* Start drawing */
  const canvasAnimation: SkinningAnimation = new SkinningAnimation(canvas);
  canvasAnimation.start();
  canvasAnimation.setScene("./static/assets/skinning/bass.dae");
}
