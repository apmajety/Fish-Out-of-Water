import { Mat3, Mat4, Vec3, Vec4 } from "../lib/TSM.js";

/* A potential interface that students should implement */
interface IWater {
  floorNormalsFlat(): Float32Array;
  floorIndicesFlat(): Uint32Array;
  floorPositionsFlat(): Float32Array;
  initWaterGeometry(): void;
}

/**
 * Represents a Water Surface with constant wave motion
 */
export class Water implements IWater {

  //floor variables
  private floorVertices: number[] = [];
  private floorFaces: number[] = [];
  private floorNormals: number[] = [];

  private waterVertices: number[] = [];
  private waterIndices: number[] = [];
  private waterNormals: number[] = [];
  private waterPositions: Float32Array; // For dynamic updates

  // Water simulation parameters
  private numX: number;
  private numZ: number;
  private heights: Float32Array;
  private prevHeights: Float32Array;
  private velocities: Float32Array;
  private bodyHeights: Float32Array;
  private spacing: number;
  private waveSpeed: number;
  private posDamping: number;
  private velDamping: number;
  private waterHeight: number;
  private lastUpdateTime: number;
  private fixedTimeStep: number = 1/60.0; // Fixed physics step
  private accumulatedTime: number = 0;
  private maxWaveHeight: number; // Maximum height that waves can reach
  private minWaveHeight: number; // Minimum height that waves can reach
  private maxTimeStep: number = 0.05; // Maximum time step (50ms)
  private paused: boolean = false;
  
  // Wave generation parameters
  private waveGenerators: WaveGenerator[] = [];
  private splashProbability: number = 0.2;    // INCREASED: Higher probability for more splashes
  private splashIntensity: number = 3.0;      // INCREASED: Higher intensity for more pronounced waves
  private windDirection: Vec3;                // Direction of wind-driven waves
  private windStrength: number = 2.0;         // INCREASED: Stronger wind effect
  private timeSinceLastWave: number = 0;      // Track time between wave generations
  private ambientWaveStrength: number = 0.8;  // INCREASED: Stronger ambient waves
  private forceAmplification: number = 2.5;   // NEW: Amplifies all wave forces
  private waveEnergyBoost: number = 0.05;     // NEW: Adds energy to counteract damping
  
  constructor() {
    // Initialize water simulation parameters
    this.spacing = 0.5;
    this.numX = Math.floor(25.0 / this.spacing) + 1;
    this.numZ = Math.floor(25.0 / this.spacing) + 1;
    this.waveSpeed = 6.0;      // INCREASED: Higher wave speed for more dynamic movement
    this.posDamping = 0.0005;  // DECREASED: Minimal damping to maintain wave energy
    this.velDamping = 0.01;    // DECREASED: Minimal velocity damping
    this.waterHeight = -1.0;
    this.lastUpdateTime = performance.now();
    
    // Set wave height limits - increased for more pronounced waves
    this.maxWaveHeight = this.waterHeight + 3.0;  // INCREASED: Higher maximum wave height
    this.minWaveHeight = this.waterHeight - 3.0;  // INCREASED: Lower minimum wave height

    // Set random wind direction - changes the directionality of waves
    const windAngle = Math.random() * Math.PI * 2;
    this.windDirection = new Vec3([Math.cos(windAngle), 0, Math.sin(windAngle)]);

    // Initialize arrays for simulation
    const totalCells = this.numX * this.numZ;
    this.heights = new Float32Array(totalCells);
    this.prevHeights = new Float32Array(totalCells);
    this.velocities = new Float32Array(totalCells);
    this.bodyHeights = new Float32Array(totalCells);
    this.waterPositions = new Float32Array(totalCells * 3);

    // Set initial water height with more significant perturbation
    for (let i = 0; i < totalCells; i++) {
      // Add more substantial random perturbation to create initial waves
      this.heights[i] = this.waterHeight + (Math.random() * 12 - 6);  // INCREASED: Bigger initial waves
      this.velocities[i] = (Math.random() - 0.5) * 6.0;  // INCREASED: Higher initial velocities
      this.bodyHeights[i] = 0.0;
    }
    
    // Create more wave generators at different positions
    this.createWaveGenerators();
    
    this.initWaterGeometry();
    
    // Add event listeners to detect tab visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // Pause simulation when tab is not visible
        this.paused = true;
      } else {
        // Resume simulation and reset timer when tab becomes visible
        this.paused = false;
        this.lastUpdateTime = performance.now();
        this.accumulatedTime = 0;
      }
    });
  }

  /**
   * Create wave generators at various positions
   */
  private createWaveGenerators(): void {
    // Add more wave generators at different positions with varied frequencies
    // These will create continuous wave patterns
    const numGenerators = 12;  // INCREASED: Doubled the number of generators
    
    for (let i = 0; i < numGenerators; i++) {
      // Place generators randomly, but away from edges
      const posX = Math.floor(this.numX * 0.2) + Math.floor(Math.random() * (this.numX * 0.6));
      const posZ = Math.floor(this.numZ * 0.2) + Math.floor(Math.random() * (this.numZ * 0.6));
      
      // Randomize frequency and amplitude
      const frequency = 0.8 + Math.random() * 2.0;       // INCREASED: Higher frequencies
      const amplitude = 2.5 + Math.random() * 3.0;       // INCREASED: Much higher amplitudes
      const radius = 3 + Math.floor(Math.random() * 6);  // INCREASED: Larger radius impact
      
      this.waveGenerators.push({
        x: posX,
        z: posZ,
        frequency: frequency,
        amplitude: amplitude,
        phase: Math.random() * Math.PI * 2, // Random phase
        radius: radius,
        lastActive: 0
      });
    }
  }

  public getWaterHeightAt(worldX: number, worldZ: number): number {
    // Convert world coordinates to grid coordinates
    const cx = this.numX / 2.0;
    const cz = this.numZ / 2.0;
    
    // Scale coordinates to match our grid spacing (accounting for the *2 scale in initWaterGeometry)
    const gridX = (worldX / (this.spacing * 2)) + cx;
    const gridZ = (worldZ / (this.spacing * 2)) + cz;
    
    // Clamp to grid bounds
    const i = Math.max(0, Math.min(Math.floor(gridX), this.numX - 2));
    const j = Math.max(0, Math.min(Math.floor(gridZ), this.numZ - 2));
    
    // Get fractional components for bilinear interpolation
    const fx = gridX - i;
    const fz = gridZ - j;
    
    // Get heights at the four surrounding grid points
    const h00 = this.heights[i * this.numZ + j];
    const h10 = this.heights[(i+1) * this.numZ + j];
    const h01 = this.heights[i * this.numZ + (j+1)];
    const h11 = this.heights[(i+1) * this.numZ + (j+1)];
    
    // Bilinear interpolation of height values
    const h0 = h00 * (1 - fx) + h10 * fx;
    const h1 = h01 * (1 - fx) + h11 * fx;
    
    return h0 * (1 - fz) + h1 * fz;
  }

  // Update the visual mesh of the water surface
  public initWaterGeometry(): void {
    const cx = this.numX / 2.0;
    const cz = this.numZ / 2.0;
    
    // Clear any existing data
    this.waterVertices = [];
    this.waterIndices = [];
    this.waterNormals = [];
    
    // Generate initial vertex positions
    for (let i = 0; i < this.numX; i++) {
      for (let j = 0; j < this.numZ; j++) {
        const idx = (i * this.numZ + j) * 3;
        const x = (i - cx) * this.spacing * 2; // Extend the size
        const y = this.heights[i * this.numZ + j]; // Use simulation height
        const z = (j - cz) * this.spacing * 2; // Extend the size
        
        // Store in water positions array for dynamic updates
        this.waterPositions[idx] = x;
        this.waterPositions[idx + 1] = y;
        this.waterPositions[idx + 2] = z;
        
        // Initial geometry 
        this.waterVertices.push(x, y, z, 1.0);
      }
    }
    
    // Generate indices for triangles
    for (let i = 0; i < this.numX - 1; i++) {
      for (let j = 0; j < this.numZ - 1; j++) {
        const id0 = i * this.numZ + j;
        const id1 = i * this.numZ + j + 1;
        const id2 = (i + 1) * this.numZ + j + 1;
        const id3 = (i + 1) * this.numZ + j;
        
        // Two triangles per grid cell
        this.waterIndices.push(id0, id1, id2, id0, id2, id3);
      }
    }
    
    // Generate initial normals
    this.updateWaterNormals();
    
    console.log(`Water geometry initialized with ${this.waterVertices.length/4} vertices and ${this.waterIndices.length/3} triangles.`);
  }
  
  /**
   * Simulate water surface physics using fixed timestep
   */
  public simulateWater(): void {
    // If paused, don't simulate
    if (this.paused) {
      this.lastUpdateTime = performance.now();
      return;
    }
    
    // Calculate real time delta
    const now = performance.now();
    let dt = (now - this.lastUpdateTime) / 1000.0;
    this.lastUpdateTime = now;
    
    // Cap the maximum time step to prevent instability when switching tabs
    dt = Math.min(dt, this.maxTimeStep);
    
    // Accumulate time since last frame
    this.accumulatedTime += dt;
    this.timeSinceLastWave += dt;
    
    // Only step physics if we've accumulated enough time
    let updated = false;
    
    // Run as many fixed time steps as needed to catch up
    while (this.accumulatedTime >= this.fixedTimeStep) {
      this.updatePhysics(this.fixedTimeStep);
      this.accumulatedTime -= this.fixedTimeStep;
      updated = true;
      
      // Safety measure: if we have too many accumulated steps, discard them
      // This prevents "spiral of death" when the computer can't keep up
      if (this.accumulatedTime > 0.2) {
        console.log("Detected simulation lag, resetting accumulated time");
        this.accumulatedTime = 0;
        break;
      }
    }
    
    // Only update mesh and mark as dirty if physics was updated
    if (updated) {
      // Update the visual mesh with new heights
      this.updateWaterMesh();
    }
  }
  
  /**
   * Add a splash at a specific position
   */
  private addSplash(i: number, j: number, strength: number, radius: number = 2): void {
    // Safety check for valid indices
    if (i < 0 || i >= this.numX || j < 0 || j >= this.numZ) return;
    
    // Add velocity impulse at the center - with increased strength
    const centerIdx = i * this.numZ + j;
    this.velocities[centerIdx] += strength * this.forceAmplification;
    
    // Create ripple effect within the radius
    for (let di = -radius; di <= radius; di++) {
      for (let dj = -radius; dj <= radius; dj++) {
        const ni = i + di;
        const nj = j + dj;
        
        // Skip if out of bounds
        if (ni < 1 || ni >= this.numX - 1 || nj < 1 || nj >= this.numZ - 1) continue;
        
        // Calculate distance from center
        const dist = Math.sqrt(di * di + dj * dj);
        if (dist > radius) continue; // Skip if outside radius
        
        // Apply velocity impulse based on distance - with amplification
        const falloff = 1.0 - dist / radius;
        const idx = ni * this.numZ + nj;
        this.velocities[idx] += strength * falloff * (Math.random() * 0.5 + 0.5) * this.forceAmplification;
      }
    }
  }

  /**
   * Apply wind force to the water surface
   */
  private applyWind(dt: number): void {
    // Wind is applied as a directional force on the water surface
    const windFactor = this.windStrength * dt;
    
    // Gradually change wind direction for more natural effect
    const windAngleChange = (Math.random() - 0.5) * 0.1;
    const windDir = this.windDirection;
    
    // Rotate wind direction slightly
    const cosAngle = Math.cos(windAngleChange);
    const sinAngle = Math.sin(windAngleChange);
    const newX = windDir.x * cosAngle - windDir.z * sinAngle;
    const newZ = windDir.x * sinAngle + windDir.z * cosAngle;
    windDir.x = newX;
    windDir.z = newZ;
    
    // Apply wind force to the water surface - creates directional waves
    for (let i = 1; i < this.numX - 1; i++) {
      for (let j = 1; j < this.numZ - 1; j++) {
        // INCREASED: Higher probability for more wind effect
        if (Math.random() < 0.01) { 
          const idx = i * this.numZ + j;
          
          // Apply velocity in wind direction with amplification
          this.velocities[idx] += (windDir.x + windDir.z) * windFactor * 
                                 (Math.random() * 0.8 + 0.2) * this.forceAmplification;
        }
      }
    }
  }
  
  /**
   * Add ambient noise to create small ripples
   */
  private addAmbientWaves(dt: number): void {
    const ambientStrength = this.ambientWaveStrength * dt * 10;
    
    // Add small random perturbations across the surface
    for (let i = 1; i < this.numX - 1; i++) {
      for (let j = 1; j < this.numZ - 1; j++) {
        // INCREASED: Higher probability for more ambient waves
        if (Math.random() < 0.02) { 
          const idx = i * this.numZ + j;
          this.velocities[idx] += (Math.random() - 0.5) * ambientStrength * this.forceAmplification;
        }
      }
    }
  }
  
  /**
   * Update wave generators
   */
  private updateWaveGenerators(dt: number): void {
    const time = performance.now() / 1000;
    
    // Process each wave generator
    for (const generator of this.waveGenerators) {
      // Calculate wave based on time
      const timeFactor = time * generator.frequency + generator.phase;
      
      // MODIFIED: Reduced time between activations for more frequent waves
      if (time - generator.lastActive > 0.7 / generator.frequency) {
        // Create wave with amplified strength
        const strength = generator.amplitude * (0.8 + Math.sin(timeFactor) * 0.2);
        this.addSplash(generator.x, generator.z, strength, generator.radius);
        generator.lastActive = time;
      }
    }
  }
  
  /**
   * Update physics with fixed time step for stability
   */
  private updatePhysics(dt: number): void {
    // Create random splashes for visual interest - increased probability
    if (Math.random() < this.splashProbability) {
      const i = Math.floor(Math.random() * (this.numX - 4)) + 2; // Keep away from edges
      const j = Math.floor(Math.random() * (this.numZ - 4)) + 2; // Keep away from edges
      const strength = (Math.random() * 2 - 0.3) * this.splashIntensity; // INCREASED strength range
      const radius = Math.floor(Math.random() * 4) + 2; // INCREASED: Random radius between 2-5
      this.addSplash(i, j, strength, radius);
    }
    
    // Update wave generators
    this.updateWaveGenerators(dt);
    
    // Apply wind forces
    this.applyWind(dt);
    
    // Add ambient wave noise
    this.addAmbientWaves(dt);
    
    // Calculate simulation constants
    const c = this.waveSpeed * this.waveSpeed;
    const pd = Math.min(this.posDamping * dt, 1.0);
    const vd = Math.max(0.0, 1.0 - this.velDamping * dt);
    
    // Store previous heights
    for (let i = 0; i < this.heights.length; i++) {
      this.prevHeights[i] = this.heights[i];
    }
    
    // Wave equation: ∂²h/∂t² = c²∇²h - d∂h/∂t
    // Discrete approximation using central differences
    for (let i = 1; i < this.numX - 1; i++) {
      for (let j = 1; j < this.numZ - 1; j++) {
        const idx = i * this.numZ + j;
        const h = this.heights[idx];
        
        // Laplacian (∇²h) using neighboring cells
        const hLeft = this.heights[(i-1) * this.numZ + j];
        const hRight = this.heights[(i+1) * this.numZ + j];
        const hUp = this.heights[i * this.numZ + (j-1)];
        const hDown = this.heights[i * this.numZ + (j+1)];
        
        const laplacian = (hLeft + hRight + hUp + hDown - 4 * h) / (this.spacing * this.spacing);
        
        // Update velocity using the wave equation
        this.velocities[idx] += dt * c * laplacian;
        
        // MODIFIED: Changed to push away from rest position instead of towards it!
        // This creates a persistent instability that maintains wave height
        const distanceFromRest = (h - this.waterHeight);
        const pushAwayForce = distanceFromRest * this.waveEnergyBoost;
        this.velocities[idx] += pushAwayForce * dt;
        
        // Add random energy boosts to maintain wave height
        if (Math.random() < 0.001) {
            this.velocities[idx] += (Math.random() - 0.5) * 2.0;
        }
        
        // Clamp velocity to prevent extreme instability - INCREASED limits
        this.velocities[idx] = Math.max(Math.min(this.velocities[idx], 8.0), -8.0);
        
        // Apply very mild damping to velocity - almost none to maintain waves
        this.velocities[idx] *= vd;
      }
    }
    
    // Update heights using velocity
    for (let i = 0; i < this.heights.length; i++) {
      this.heights[i] += this.velocities[i] * dt;
      
      // Enforce height limits with elastic bouncing
      if (this.heights[i] > this.maxWaveHeight) {
        this.heights[i] = this.maxWaveHeight;
        // MODIFIED: More elastic bounce (less energy loss)
        this.velocities[i] *= -0.8; 
      } else if (this.heights[i] < this.minWaveHeight) {
        this.heights[i] = this.minWaveHeight;
        // MODIFIED: More elastic bounce (less energy loss)
        this.velocities[i] *= -0.8;
      }
    }
    
    // Apply boundary conditions (fixed edges)
    for (let i = 0; i < this.numX; i++) {
      // First and last row
      this.heights[i * this.numZ] = this.waterHeight;
      this.velocities[i * this.numZ] = 0;
      
      this.heights[i * this.numZ + this.numZ - 1] = this.waterHeight;
      this.velocities[i * this.numZ + this.numZ - 1] = 0;
    }
    
    for (let j = 0; j < this.numZ; j++) {
      // First and last column
      this.heights[j] = this.waterHeight;
      this.velocities[j] = 0;
      
      this.heights[(this.numX - 1) * this.numZ + j] = this.waterHeight;
      this.velocities[(this.numX - 1) * this.numZ + j] = 0;
    }
  }
  
  /**
   * Update the water mesh vertices based on simulated heights
   */
  private updateWaterMesh(): void {
    // Update vertex positions based on calculated heights
    for (let i = 0; i < this.numX; i++) {
      for (let j = 0; j < this.numZ; j++) {
        const id = i * this.numZ + j;
        const vertexId = id * 4; // Each vertex has 4 components (x,y,z,w)
        
        // Update y-coordinate (height)
        this.waterVertices[vertexId + 1] = this.heights[id];
      }
    }
    
    // Recalculate normals based on the new heights
    this.updateWaterNormals();
  }
  
  /**
   * Update water normals based on the current heights
   */
  private updateWaterNormals(): void {
    // Clear previous normals
    this.waterNormals = [];
    
    // For each vertex, calculate normal based on its neighbors
    for (let i = 0; i < this.numX; i++) {
      for (let j = 0; j < this.numZ; j++) {
        // Default normal (pointing up)
        let nx = 0, ny = 1, nz = 0;
        
        // If we have neighbors, calculate the normal using central differences
        if (i > 0 && i < this.numX - 1 && j > 0 && j < this.numZ - 1) {
          // Get heights of neighboring vertices
          const hLeft = this.heights[(i-1) * this.numZ + j];
          const hRight = this.heights[(i+1) * this.numZ + j];
          const hUp = this.heights[i * this.numZ + (j-1)];
          const hDown = this.heights[i * this.numZ + (j+1)];
          
          // Calculate normal using gradient approximation
          nx = hLeft - hRight;
          nz = hUp - hDown;
          
          // Normalize
          const length = Math.sqrt(nx * nx + 1.0 + nz * nz);
          nx /= length;
          ny = 1.0 / length;
          nz /= length;
        }
        
        // Store normal (vec4 format for shader)
        this.waterNormals.push(nx, ny, nz, 0.0);
      }
    }
  }

  /* Returns a flat Float32Array of the water's vertex positions */
  public floorPositionsFlat(): Float32Array {
    return new Float32Array(this.waterVertices);
  }

  /**
   * Returns a flat Uint32Array of the water's face indices
   */
  public floorIndicesFlat(): Uint32Array {
    return new Uint32Array(this.waterIndices);
  }

  /**
   * Returns a flat Float32Array of the water's normals
   */
  public floorNormalsFlat(): Float32Array {
    return new Float32Array(this.waterNormals);
  }

  /**
   * Returns the model matrix of the water
   */
  public uMatrix(): Mat4 {
    // TODO: change this, if it's useful
    const ret : Mat4 = new Mat4().setIdentity();
    return ret;    
  }
}

/**
 * Interface for wave generator properties
 */
interface WaveGenerator {
  x: number;         // X grid position
  z: number;         // Z grid position
  frequency: number; // How often waves are generated
  amplitude: number; // Wave strength
  phase: number;     // Phase offset for variation
  radius: number;    // Impact radius
  lastActive: number; // Last time a wave was generated
}