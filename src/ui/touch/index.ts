/** Controles de toque compartilhados — veja docs/CONTROLES.md. */
export { Joystick, createJoystick, joyRadius, type JoystickOptions, type JoyState } from './joystick';
export { LookDrag, createLook, type LookOptions } from './look';
export { bindButton, type ButtonOptions, type BoundButton } from './button';
export { Gyro } from './gyro';
export { Spring2 } from './spring';
export { controls, setControl, onControlsChange, isSolo, setSolo, SENS_MUL, JOY_MUL, type ControlPrefs } from './settings';
export { renderControlsSettings, soloToggle } from './settings-ui';
export { surfaceOf } from './surface';
export { FpsControls, type FpsControlsOptions } from './fps';
