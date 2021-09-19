// Spark AR Modules
const Scene = require("Scene");
const Audio = require("Audio");
const TouchGestures = require("TouchGestures");
const Materials = require("Materials");
const Time = require("Time");
const Textures = require("Textures");
const Animation = require("Animation");
const Reactive = require("Reactive");
const Diagnostics = require('Diagnostics');


(async function () {
  const [
    // Game Objects
    mychar,
    unit_mill,
    blocks,
    platforms,
    buttons,
    waterEmitter,
    buttonMats,
    blockMats,
    buttonTextures,

  ] = await Promise.all([
    // Game Objects
    Scene.root.findFirst("mychar"),
    Scene.root.findFirst("unit_mill"),
    Scene.root.findByPath("**/blocks/*"),
    Scene.root.findByPath("**/platforms/*"),
    Scene.root.findByPath("**/buttons/*"),
    Scene.root.findFirst("water_emitter"),
    Materials.findUsingPattern("btn*"),
    Materials.findUsingPattern("*block_mat"),
    Textures.findUsingPattern("btn*"),
   
  ]);

  // Game constants
  const levels = require("./level");
  const gridSize = 0.36;
  const gridInc = 0.12;
  const numOfPlatforms = 10;
  const playerInitY = 0.02;
  const blockSlotInc = 0.1;
  const initBlockSlot = 0.6;
  const numOfBlocks = 10;
  const blockInitY = 0.9;
  const states = {
    start: 1,
    running: 2,
    complete: 3,
    failed: 4,
  };

  // Game variables
  let currentLevel = 0;
  let playerDir = levels[currentLevel].facing;
  let commands = [];
  let blocksUsed = 0;
  let currentState = states.start;
  let nextBlockSlot = initBlockSlot;
  let exeIntervalID;
  let allCoordinates = createAllCoordinates();
  let pathCoordinates = createPathCoordinates();
  let dangerCoordinates = createDangerCoordinates();

  /*------------- Button Taps -------------*/

  buttons.forEach((button, i) => {
    TouchGestures.onTap(button).subscribe(function () {
      switch (i) {
        case 0:
          Diagnostics.log("forward1");
          addCommand("forward");
          break;
        case 1:
          addCommand("left");
          break;
        case 2:
          addCommand("right");
          break;
        case 3:
          switch (currentState) {
            case states.failed:
              resetLevel();
              break;
            case states.uncomplete:
              resetLevel();
              break;
            case states.complete:
              nextLevel("next");
              break;
          }
          break;
        case 4:
          if (blocksUsed !== 0 && currentState === states.start) {
            let popped = commands.pop();
            popped.block.transform.y = blockInitY;
            popped.block.hidden = true;
            nextBlockSlot += blockSlotInc;
            blocksUsed--;
          }
          break;
      }
    });
  });

  /*------------- Monitor Player Position -------------*/

  Reactive.monitorMany({
    x: mychar.transform.x,
    z: mychar.transform.z,
  }).subscribe(({ newValues }) => {
    let playerX = newValues.x;
    let playerZ = newValues.z;
    let goalX = pathCoordinates[pathCoordinates.length - 1][0];
    let goalZ = pathCoordinates[pathCoordinates.length - 1][1];
    let collisionArea = 0.005;

    // Check if player is on the goal
    if (
      isBetween(playerX, goalX + collisionArea, goalX - collisionArea) &&
      isBetween(playerZ, goalZ + collisionArea, goalZ - collisionArea)
    ) {
      mychar.transform.x =  Reactive.val(goalX);
      mychar.transform.z = Reactive.val(goalZ);
      commands = [];
      changeState(states.complete, "btn_next");
      unit_mill.hidden = Reactive.val(true);
      animateLevelComplete();
    }

    // Check if player is on a danger zone
    for (let i = 0; i < dangerCoordinates.length; i++) {
      let dx = dangerCoordinates[i][0];
      let dz = dangerCoordinates[i][1];
      if (
        isBetween(playerX, dx + collisionArea, dx - collisionArea) &&
        isBetween(playerZ, dz + collisionArea, dz - collisionArea)
      ) {
        mychar.transform.x = Reactive.val(dx);
        mychar.transform.z = Reactive.val(dz);
        commands = [];
        changeState(states.failed, "btn_retry");
        animatePlayerFall();
      }
    }
  });

  function createAllCoordinates() {
    // Creates a grid of coordinates
    let coords = [];
    for (let i = -gridSize; i <= gridSize; i += gridInc) {
      for (let j = -gridSize; j <= gridSize; j += gridInc) {
        let x = Math.round(i * 1e4) / 1e4;
        let z = Math.round(j * 1e4) / 1e4;
        coords.push([x, z]);
      }
    }
    return coords;
  }

  function createPathCoordinates() {
    // Get the current level path coordinates from all the coordinates
    let path = levels[currentLevel].path;
    let coords = [];
    for (let i = 0; i < path.length; i++) {
      let x = allCoordinates[path[i][0]][1];
      let z = allCoordinates[path[i][1]][1];
      coords.push([x, z]);
    }
    return coords;
  }

  function createDangerCoordinates() {
    // Get the danger coordinates by removing the current path coordinates
    let coords = allCoordinates;
    for (let i = 0; i < pathCoordinates.length; i++) {
      for (let j = 0; j < coords.length; j++) {
        let lvlCoordStr = JSON.stringify(pathCoordinates[i]);
        let genCoordStr = JSON.stringify(coords[j]);
        if (lvlCoordStr === genCoordStr) {
          coords.splice(j, 1);
        }
      }
    }
    return coords;
  }

  function addCommand(move) {
    Diagnostics.log("forward2");
    let sd = {command: move};
    animatePlayerMovement(sd.command);
    Diagnostics.log("forward3");

  }

  /*------------- Execution functions -------------*/

  // function executeCommands() {
  //   currentState = states.running;
  //   let executionCommands = [];
  //   for (let i = 0; i < commands.length; i++) {
  //     executionCommands.push(commands[i].command);
  //   }
  //   setExecutionInterval(
  //     function (e) {
  //       animatePlayerMovement(executionCommands[e]);
  //     },
  //     1000,
  //     executionCommands.length
  //   );
  // }

  function setExecutionInterval(callback, delay, repetitions) {
    let e = 0;
    callback(0);
    exeIntervalID = Time.setInterval(function () {
      callback(e + 1);
      if (++e === repetitions) {
        Time.clearInterval(exeIntervalID);
        if (currentState === states.running) currentState = states.uncomplete;
        setTexture("btn_retry");
      }
    }, delay);
  }

  /*------------- Rabbit Movement Animation -------------*/

  function animatePlayerMovement(command) {
    const timeDriverParameters = {
      durationMilliseconds: 400,
      loopCount: 1,
      mirror: false,
    };

    const timeDriver = Animation.timeDriver(timeDriverParameters);
    const translationNegX = Animation.animate(
      timeDriver,
      Animation.samplers.linear(
        mychar.transform.x.pinLastValue(),
        mychar.transform.x.pinLastValue() - gridInc
      )
    );

    const translationPosX = Animation.animate(
      timeDriver,
      Animation.samplers.linear(
        mychar.transform.x.pinLastValue(),
        mychar.transform.x.pinLastValue() + gridInc
      )
    );

    const translationNegZ = Animation.animate(
      timeDriver,
      Animation.samplers.linear(
        mychar.transform.z.pinLastValue(),
        mychar.transform.z.pinLastValue() - gridInc
      )
    );

    const translationPosZ = Animation.animate(
      timeDriver,
      Animation.samplers.linear(
        mychar.transform.z.pinLastValue(),
        mychar.transform.z.pinLastValue() + gridInc
      )
    );

    const rotationLeft = Animation.animate(
      timeDriver,
      Animation.samplers.linear(
        mychar.transform.rotationY.pinLastValue(),
        mychar.transform.rotationY.pinLastValue() + degreesToRadians(90)
      )
    );

    const rotationRight = Animation.animate(
      timeDriver,
      Animation.samplers.linear(
        mychar.transform.rotationY.pinLastValue(),
        mychar.transform.rotationY.pinLastValue() - degreesToRadians(90)
      )
    );

    const jump = Animation.animate(
      timeDriver,
      Animation.samplers.linear(
        mychar.transform.y.pinLastValue(),
        mychar.transform.y.pinLastValue()+0.2,
      )
    );

    timeDriver.start();
    Diagnostics.log("forward4");
    Diagnostics.log(command);
    
    switch (command) {
      
      case "forward":
        Diagnostics.log("forward");
        if (playerDir === "north") {
          mychar.transform.x = translationPosX;
        } else if (playerDir === "west") {
          mychar.transform.z = translationNegZ;
        } else if (playerDir === "south") {
          mychar.transform.x = translationNegX;
        } else if (playerDir === "east") {
          mychar.transform.z = translationPosZ;
        }
        break;
      case "left":
        if (playerDir === "east") {
          playerDir = "north";
        } else if (playerDir === "north") {
          playerDir = "west";
        } else if (playerDir === "west") {
          playerDir = "south";
        } else if (playerDir === "south") {
          playerDir = "east";
        }
        mychar.transform.rotationY = rotationLeft;
        break;
      case "right":
        if (playerDir === "east") {
          playerDir = "south";
        } else if (playerDir === "south") {
          playerDir = "west";
        } else if (playerDir === "west") {
          playerDir = "north";
        } else if (playerDir === "north") {
          playerDir = "east";
        }
        mychar.transform.rotationY = rotationRight;
        break;
    }
  }

  /*------------- Player Idle Animation -------------*/

  function animatePlayerIdle() {
    const timeDriverParameters = {
      durationMilliseconds: 400,
      loopCount: Infinity,
      mirror: true,
    };
    const timeDriver = Animation.timeDriver(timeDriverParameters);

    const scale = Animation.animate(
      timeDriver,
      Animation.samplers.linear(
        mychar.transform.scaleY.pinLastValue(),
        mychar.transform.scaleY.pinLastValue() + 0.02
      )
    );

    mychar.transform.scaleY = scale;

    timeDriver.start();
  }

  animatePlayerIdle();

  /*------------- Level Complete Animation -------------*/

  function animateLevelComplete() {
    const timeDriverParameters = {
      durationMilliseconds: 450,
      loopCount: 2,
      mirror: false,
    };

    const timeDriver = Animation.timeDriver(timeDriverParameters);




    timeDriver.start();
  }

  /*------------- Player Fall Animation -------------*/

  function animatePlayerFall() {
    emmitWaterParticles();
    const timeDriverParameters = {
      durationMilliseconds: 100,
      loopCount: 1,
      mirror: false,
    };

    const timeDriver = Animation.timeDriver(timeDriverParameters);

    const moveY = Animation.animate(
      timeDriver,
      Animation.samplers.easeInOutSine(playerInitY - 0.1, -0.17)
    );

    mychar.transform.y = moveY;

    timeDriver.start();

    Time.setTimeout(function () {
      mychar.hidden = Reactive.val(true);
    }, 200);
  }

  /*------------- unit_mill Spin Animation -------------*/

  function animateunit_mill() {
    const timeDriverParameters = {
      durationMilliseconds: 2500,
      loopCount: Infinity,
      mirror: false,
    };

    const timeDriver = Animation.timeDriver(timeDriverParameters);

    const rotate = Animation.animate(
      timeDriver,
      Animation.samplers.linear(
        unit_mill.transform.rotationY.pinLastValue(),
        unit_mill.transform.rotationY.pinLastValue() - degreesToRadians(360)
      )
    );

    unit_mill.transform.rotationY = rotate;

    timeDriver.start();
  }

  animateunit_mill();

  /*------------- Water Splash Animation -------------*/

  function emmitWaterParticles() {
    // const sizeSampler = Animation.samplers.easeInQuad(0.015, 0.007);
    // waterEmitter.transform.x = mychar.transform.x;
    // waterEmitter.transform.z = mychar.transform.z;

    Time.setTimeout(function () {
      mychar.hidden = Reactive.val(true);
    }, 200);
  }

  /*------------- Initialize current level -------------*/

  function initLevel() {
    playerDir = levels[currentLevel].facing;

    // Set the player's initial position
    mychar.transform.x = Reactive.val(pathCoordinates[0][0]);
    mychar.transform.z = Reactive.val(pathCoordinates[0][1]);
    mychar.transform.y = Reactive.val(playerInitY);

    // set unit_mill position
    let goalX = pathCoordinates[pathCoordinates.length - 1][0];
    let goalZ = pathCoordinates[pathCoordinates.length - 1][1];
    unit_mill.transform.x = Reactive.val(goalX);
    unit_mill.transform.z = Reactive.val(goalZ);
    unit_mill.transform.y = Reactive.val(0.03);
    unit_mill.hidden = Reactive.val(false);

    // Set the player's initial direction
    if (playerDir === "east") {
      mychar.transform.rotationY = Reactive.val(0);
    } else if (playerDir === "north") {
      mychar.transform.rotationY = Reactive.val(degreesToRadians(90));
    } else if (playerDir === "west") {
      mychar.transform.rotationY = Reactive.val(degreesToRadians(180));
    } else if (playerDir === "south") {
      mychar.transform.rotationY = Reactive.val(degreesToRadians(270));
    }

    // Add the path platforms
    for (let i = 0; i < pathCoordinates.length; i++) {
      let path = pathCoordinates[i];
      let x = path[0];
      let z = path[1];
      let platform = platforms[i];
      platform.transform.x = Reactive.val(x);
      platform.transform.z = Reactive.val(z);
      platform.hidden = Reactive.val(false);
    }
  }

  initLevel();

  /*------------- Reset current level -------------*/

  function resetLevel() {
    currentState = states.start;
    playerDir = levels[currentLevel].facing;
    commands = [];
    blocksUsed = 0;
    nextBlockSlot = initBlockSlot;

    mychar.hidden = Reactive.val(false);

    setTexture("btn_play");

    initLevel();
  }

  /*------------- Go to next level -------------*/

  function nextLevel(state) {
    if (state === "next" && currentLevel < levels.length - 1) {
      currentLevel++;
    } else {
      currentLevel = 0;
    }

    allCoordinates = createAllCoordinates();
    pathCoordinates = createPathCoordinates();
    dangerCoordinates = createDangerCoordinates();

    for (let i = 0; i < numOfPlatforms; i++) {
      let platform = platforms[i];
      platform.hidden = Reactive.val(true);
    }

    resetLevel();
  }

  /*------------- Utils -------------*/

  function degreesToRadians(degrees) {
    let pi = Math.PI;
    return degrees * (pi / 180);
  }

  function setTexture(texture_name) {
    for (let i = 0; i < buttonTextures.length; i++) {
      if (buttonTextures[i].name === texture_name) {
        let signal = buttonTextures[i].signal;
        buttonMats[3].setTextureSlot("DIFFUSE", signal);
      }
    }
  }

  function isBetween(n, a, b) {
    return (n - a) * (n - b) <= 0;
  }

  function changeState(state, buttonText) {
    Time.setTimeout(function () {
      currentState = state;
      setTexture(buttonText);
    }, 500);
  }
})();
