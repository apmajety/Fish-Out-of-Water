import { Camera } from "../lib/webglutils/Camera.js";
import { CanvasAnimation } from "../lib/webglutils/CanvasAnimation.js";
import { SkinningAnimation } from "./App.js";
import { Mat4, Mat3, Vec3, Vec4, Vec2, Mat2, Quat } from "../lib/TSM.js";
import { Bone } from "./Scene.js";
import { RenderPass } from "../lib/webglutils/RenderPass.js";

/**
 * Might be useful for designing any animation GUI
 */
interface IGUI {
  viewMatrix(): Mat4;
  projMatrix(): Mat4;
  dragStart(me: MouseEvent): void;
  drag(me: MouseEvent): void;
  dragEnd(me: MouseEvent): void;
  onKeydown(ke: KeyboardEvent): void;
}

export enum Mode {
  playback,  
  edit  
}

	
/**
 * Handles Mouse and Button events along with
 * the the camera.
 */

export class GUI implements IGUI {
  private static readonly rotationSpeed: number = 0.05;
  private static readonly zoomSpeed: number = 0.1;
  private static readonly rollSpeed: number = 0.1;
  private static readonly panSpeed: number = 0.1;

  private camera: Camera;
  private dragging: boolean;
  private fps: boolean;
  private prevX: number;
  private prevY: number;
  private prevX2: number;
  private prevY2: number;
  public status: string = "Still Alive!";
  public lifeCount: number = 3;

  private height: number;
  private viewPortHeight: number;
  private width: number;

  private animation: SkinningAnimation;

  public selectedBone: number;
  private boneDragging: boolean = false;
  private boneSelected: boolean = false;
  private animationState: {running: boolean} = {running: false};
  public duration: {duration: number} = {duration: 100};
  
  public closestBone: Bone;

  public time: number;
  public mode: Mode;
  public dualQuatShader: boolean = false;

  public hoverX: number = 0;
  public hoverY: number = 0;


  /**
   *
   * @param canvas required to get the width and height of the canvas
   * @param animation required as a back pointer for some of the controls
   * @param sponge required for some of the controls
   */
  constructor(canvas: HTMLCanvasElement, animation: SkinningAnimation) {
    this.height = canvas.height;
    this.viewPortHeight = this.height - 200;
    this.width = canvas.width;
    this.prevX = 0;
    this.prevY = 0;
    
    this.animation = animation;
    
    this.reset();
    
    this.registerEventListeners(canvas);
  }
  
  public getTime(): number { 
  	return this.time; 
  }
  
  public getMaxTime(): number { 
    //TODO: The animation should stop after the last keyframe
    return 0;
  }

  /**
   * Resets the state of the GUI
   */
  public reset(): void {
    this.fps = false;
    this.dragging = false;
    this.time = 0;
	  this.mode = Mode.edit;
    
    this.camera = new Camera(
      new Vec3([0, 7, -15]),
      new Vec3([0, 0, 0]),
      new Vec3([0, 1, 0]),
      45,
      this.width / this.viewPortHeight,
      0.1,
      1000.0
    );

    this.lifeCount=3;
    this.status = "Still Alive!";
  }

  /**
   * Sets the GUI's camera to the given camera
   * @param cam a new camera
   */
  public setCamera(
    pos: Vec3,
    target: Vec3,
    upDir: Vec3,
    fov: number,
    aspect: number,
    zNear: number,
    zFar: number
  ) {
    this.camera = new Camera(pos, target, upDir, fov, aspect, zNear, zFar);
  }

  /**
   * Returns the view matrix of the camera
   */
  public viewMatrix(): Mat4 {
    return this.camera.viewMatrix();
  }

  /**
   * Returns the projection matrix of the camera
   */
  public projMatrix(): Mat4 {
    return this.camera.projMatrix();
  }

  /**
   * Callback function for the start of a drag event.
   * @param mouse
   */
  public dragStart(mouse: MouseEvent): void {
    if (mouse.offsetY > 600) {
      return; 
    }
    this.dragging = true;
    this.prevX = mouse.screenX;
    this.prevY = mouse.screenY;
    this.prevX2 = mouse.offsetX;
    this.prevY2 = mouse.offsetY;

    if (this.boneSelected) {
      this.boneDragging = true;
    }
  }

  public incrementTime(dT: number): void {
    if (this.mode === Mode.playback) {
      this.time += dT;
      if (this.time >= this.getMaxTime()) {
        this.time = 0;
        this.mode = Mode.edit;
      }
    }
  }
  

  /**
   * The callback function for a drag event.
   * This event happens after dragStart and
   * before dragEnd.
   * @param mouse
   */
  public drag(mouse: MouseEvent): void {
      let x = mouse.offsetX;
      let y = mouse.offsetY;
      if (this.dragging) {
        const dx = mouse.screenX - this.prevX;
        const dy = mouse.screenY - this.prevY;
        this.prevX = mouse.screenX;
        this.prevY = mouse.screenY;
  
        /* Left button, or primary button */
        const mouseDir: Vec3 = this.camera.right();
        mouseDir.scale(-dx);
        mouseDir.add(this.camera.up().scale(dy));
        mouseDir.normalize();
  
        if (dx === 0 && dy === 0) {
          return;
        }
  
        switch (mouse.buttons) {
          case 1: {
            let rotAxis: Vec3 = Vec3.cross(this.camera.forward(), mouseDir);
            rotAxis = rotAxis.normalize();
  
            if (this.fps) {
              this.camera.rotate(rotAxis, GUI.rotationSpeed);
            } else {
              this.camera.orbitTarget(rotAxis, GUI.rotationSpeed);
            }
            break;
          }
          case 2: {
            /* Right button, or secondary button */
            this.camera.offsetDist(Math.sign(mouseDir.y) * GUI.zoomSpeed);
            break;
          }
          default: {
            break;
          }
        }
      }
    }
  
  /**
   * Callback function for the end of a drag event
   * @param mouse
   */
  public dragEnd(mouse: MouseEvent): void {
    this.dragging = false;
    this.prevX = 0;
    this.prevY = 0;
    this.boneDragging = false;
  }

  /**
   * Callback function for a key press event
   * @param key
   */
  public onKeydown(key: KeyboardEvent): void {
    switch (key.code) {
      case "KeyR": {
        this.duration.duration = 250;
        this.animation.getScene().meshes[0].keyframeRotations = [[]];
        this.animation.reset();
        break;
      }
    case "KeyU": {
      //translate root bone on space key press
      this.animation.getScene().meshes[0].rootBone.forEach((bone, index) => {
        bone.boneRotation(new Mat4().setIdentity());
        bone.boneTranslation(new Vec3([0.0, 0.5, 0.0]));
      });

      if (this.animationState.running) {
        this.animationState.running = false;
    }
    
    // Reset animation state
    this.time = 0;
    this.mode = Mode.playback;

      const upAnimation = {
        "bones": 11,
        "keyframes": [
          [
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1
          ],
          [
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0.9762038588523865,
            -0.21685466170310974,
            0,
            0,
            0.21685466170310974,
            0.9762038588523865,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0.9912866950035095,
            0.13172033429145813,
            0,
            0,
            -0.13172033429145813,
            0.9912866950035095,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0.9778847694396973,
            0.20914426445960999,
            0,
            0,
            -0.20914426445960999,
            0.9778847694396973,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1
          ],
          [
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0.9964234828948975,
            -0.08449849486351013,
            0,
            0,
            0.08449849486351013,
            0.9964234828948975,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0.9969384074211121,
            -0.07818692922592163,
            0,
            0,
            0.07818692922592163,
            0.9969384074211121,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0.9980179667472839,
            -0.06293031573295593,
            0,
            0,
            0.06293031573295593,
            0.9980179667472839,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1
          ]
        ]
      };
      this.loadAnimationFromString(JSON.stringify(upAnimation));
    this.animationState.running = true;
    this.playKeyframeAnimation(this.animationState);
    break;
    }
    
      default: {
        console.log("Key : '", key.code, "' was pressed.");
        break;
      }
    }
  }

  getModeString() {
    return this.status + " Remaining Lives: " + this.lifeCount;
}

  private async playKeyframeAnimation(animationState: {running: boolean}): Promise<void> {
    const keyframes = this.animation.getScene().meshes[0].keyframeRotations;
        
    // Play each keyframe pair sequentially
    for (let i = 0; i < keyframes.length - 1; i++) {
      if (!animationState.running) {
        this.mode = Mode.edit;
        return;
      }
               
      try {
        // Start animation for this keyframe pair
        const completed = await this.animation.getScene().meshes[0].slerpFrames(
          keyframes[i],
          keyframes[i+1],
          animationState,
          this.duration.duration
        );
                       
        // If animation was aborted, exit loop
        if (!completed) {
          this.mode = Mode.edit;
          return;
        }
      } catch (error) {
        // Clean up timer in case of error
        console.error("Animation error:", error);
        animationState.running = false;
        this.mode = Mode.edit;
        return;
      }
    }
        
    animationState.running = false;
    this.mode = Mode.edit;
  }

  public saveAnimationToString(): string {
    const mesh = this.animation.getScene().meshes[0];
    const saveData = {
        bones: mesh.bones.length,
        keyframes: mesh.keyframeRotations.map(frame => 
            frame.map(mat => Array.from(mat.all()))
               .reduce((acc, val) => acc.concat(val), [])
        )
    };
    return JSON.stringify(saveData, null, 2); // Pretty-print for readability
}

public loadAnimationFromString(data: string): boolean {
    try {
        const loaded = JSON.parse(data);
        const mesh = this.animation.getScene().meshes[0];
        
        // Validate bone structure
        if (loaded.bones !== mesh.bones.length) {
            throw new Error(`Bone count mismatch (File: ${loaded.bones}, Current: ${mesh.bones.length})`);
        }

        console.log("pasted data" + data);

        mesh.keyframeRotations = loaded.keyframes.map((frame: number[]) => {
            const mats: Mat4[] = [];
            for (let i = 0; i < frame.length; i += 16) {
                mats.push(new Mat4(frame.slice(i, i + 16)));
            }
            return mats;
        });

        return true;
    } catch (e) {
        console.error("Loading failed:", e);
        return false;
    }
}

  

  /**
   * Registers all event listeners for the GUI
   * @param canvas The canvas being used
   */
  private registerEventListeners(canvas: HTMLCanvasElement): void {
    /* Event listener for key controls */
    window.addEventListener("keydown", (key: KeyboardEvent) =>
      this.onKeydown(key)
    );

    /* Event listener for mouse controls */
    canvas.addEventListener("mousedown", (mouse: MouseEvent) =>
      this.dragStart(mouse)
    );

    canvas.addEventListener("mousemove", (mouse: MouseEvent) =>
      this.drag(mouse)
    );

    canvas.addEventListener("mouseup", (mouse: MouseEvent) =>
      this.dragEnd(mouse)
    );

    /* Event listener to stop the right click menu */
    canvas.addEventListener("contextmenu", (event: any) =>
      event.preventDefault()
    );
  }
}
