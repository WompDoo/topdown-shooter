// Keyboard + mouse capture. Mouse position is stored in CSS pixels relative to
// the canvas; main.ts converts it to world space through the camera.
//
// Button state is read from the authoritative `e.buttons` bitmask on every mouse
// event (not per-button booleans), so holding right-to-aim while left-to-fire
// works reliably and stuck buttons self-heal.

export interface Input {
  down: Set<string>;
  justPressed: Set<string>;
  mouse: { x: number; y: number };
  mouseDown: boolean;
  rightDown: boolean;
  isDown(code: string): boolean;
  pressed(code: string): boolean;
  endFrame(): void;
}

export function createInput(canvas: HTMLCanvasElement): Input {
  const down = new Set<string>();
  const justPressed = new Set<string>();
  const mouse = { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 };
  const state = { mouseDown: false, rightDown: false };

  window.addEventListener('keydown', (e) => {
    if (!down.has(e.code)) justPressed.add(e.code);
    down.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => down.delete(e.code));

  const updateMouse = (e: MouseEvent): void => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  };
  // `buttons` bitmask: 1 = left, 2 = right, 4 = middle.
  const syncButtons = (e: MouseEvent): void => {
    const left = (e.buttons & 1) !== 0;
    if (left && !state.mouseDown) justPressed.add('Mouse0'); // rising edge for semi/melee
    state.mouseDown = left;
    state.rightDown = (e.buttons & 2) !== 0;
  };
  const onMove = (e: MouseEvent): void => {
    updateMouse(e);
    syncButtons(e);
  };
  const onDown = (e: MouseEvent): void => {
    updateMouse(e);
    syncButtons(e);
  };
  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', syncButtons);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('blur', () => {
    down.clear();
    state.mouseDown = false;
    state.rightDown = false;
  });

  return {
    down,
    justPressed,
    mouse,
    get mouseDown() {
      return state.mouseDown;
    },
    get rightDown() {
      return state.rightDown;
    },
    isDown: (code) => down.has(code),
    pressed: (code) => justPressed.has(code),
    endFrame: () => justPressed.clear(),
  };
}
