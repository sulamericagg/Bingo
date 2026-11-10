/** Controles de toque compartilhados — veja docs/CONTROLES.md. */
export { Joystick, createJoystick, joyRadius, type JoystickOptions, type JoyState } from './joystick';
export { LookDrag, createLook, type LookOptions } from './look';
export { bindButton, type ButtonOptions, type BoundButton } from './button';
export { Gyro } from './gyro';
export { Spring2 } from './spring';
export { controls, setControl, onControlsChange, getControlPrefs, onControlPrefs, CONTROL_DEFAULTS, isSolo, setSolo, JOY_MUL, type ControlPrefs, type JoyMode, type JoySize } from './settings';
export { renderControlsSettings, soloToggle } from './settings-ui';
export { surfaceOf } from './surface';
export { FpsControls, type FpsControlsOptions } from './fps';
