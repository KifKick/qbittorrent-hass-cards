// Design system borrowed from Mushroom: the same tokens (with the same
// defaults) resolved from the public --mush-* variables, so a Mushroom theme or
// card_mod override restyles these cards too; plus Mushroom's primitives
// (shape icon, state item, chip, control button) in plain CSS.

import { css } from "lit";

export const baseStyles = css`
  :host {
    --spacing: var(--mush-spacing, 10px);
    --icon-size: var(--mush-icon-size, 36px);
    --icon-border-radius: var(--mush-icon-border-radius, 50%);
    --icon-symbol-size: var(--mush-icon-symbol-size, 0.667em);
    --badge-size: var(--mush-badge-size, 16px);
    --control-height: var(--mush-control-height, 42px);
    --control-border-radius: var(--mush-control-border-radius, 12px);
    --control-icon-size: var(--mush-control-icon-size, 0.5em);
    --control-spacing: var(--mush-control-spacing, 12px);
    --chip-spacing: var(--mush-chip-spacing, 8px);
    --chip-height: var(--mush-chip-height, 36px);
    --chip-padding: var(--mush-chip-padding, 0 0.25em);
    --chip-border-radius: var(--mush-chip-border-radius, 19px);
    --chip-font-size: var(--mush-chip-font-size, 0.3em);
    --chip-font-weight: var(--mush-chip-font-weight, bold);
    --chip-icon-size: var(--mush-chip-icon-size, 0.5em);
    --card-primary-font-size: var(--mush-card-primary-font-size, 14px);
    --card-secondary-font-size: var(--mush-card-secondary-font-size, 12px);
    --card-primary-font-weight: var(--mush-card-primary-font-weight, 500);
    --card-secondary-font-weight: var(--mush-card-secondary-font-weight, 400);
    --card-primary-line-height: var(--mush-card-primary-line-height, 20px);
    --card-secondary-line-height: var(--mush-card-secondary-line-height, 16px);
    --card-primary-color: var(--mush-card-primary-color, var(--primary-text-color));
    --card-secondary-color: var(--mush-card-secondary-color, var(--primary-text-color));
    --card-primary-letter-spacing: var(--mush-card-primary-letter-spacing, 0.1px);
    --card-secondary-letter-spacing: var(--mush-card-secondary-letter-spacing, 0.4px);

    /* Colours are "r, g, b" triplets (Mushroom's convention, --mush-rgb-* overrides). */
    --rgb-red: var(--mush-rgb-red, 244, 67, 54);
    --rgb-purple: var(--mush-rgb-purple, 146, 107, 199);
    --rgb-blue: var(--mush-rgb-blue, 33, 150, 243);
    --rgb-light-blue: var(--mush-rgb-light-blue, 3, 169, 244);
    --rgb-teal: var(--mush-rgb-teal, 0, 150, 136);
    --rgb-green: var(--mush-rgb-green, 76, 175, 80);
    --rgb-amber: var(--mush-rgb-amber, 255, 193, 7);
    --rgb-orange: var(--mush-rgb-orange, 255, 152, 0);
    --rgb-grey: var(--mush-rgb-grey, 158, 158, 158);
    --rgb-disabled: var(--mush-rgb-disabled, 189, 189, 189);
    --rgb-text: var(--rgb-primary-text-color, 33, 33, 33);
    --tint: rgba(var(--rgb-text), 0.05);
  }
  :host([dark-mode]) {
    --rgb-disabled: var(--mush-rgb-disabled, 111, 111, 111);
  }

  ha-card {
    box-sizing: border-box;
    height: auto;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    container: qbt / inline-size;
  }
  :host([layout="grid"]) ha-card {
    height: 100%;
  }

  /* --- State item: shape icon + primary/secondary text ---------------------- */
  .state-item {
    display: flex;
    align-items: center;
    gap: var(--spacing);
    padding: var(--spacing);
    min-width: 0;
  }
  .shape {
    position: relative;
    flex: none;
    width: var(--icon-size);
    height: var(--icon-size);
    font-size: var(--icon-size);
    border-radius: var(--icon-border-radius);
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgb(var(--c, var(--rgb-disabled)));
    background-color: rgba(var(--c, var(--rgb-disabled)), 0.2);
    transition:
      background-color 280ms ease-out,
      color 280ms ease-in-out;
  }
  .shape ha-icon {
    --mdc-icon-size: var(--icon-symbol-size);
    display: flex;
    line-height: 0;
  }
  .shape.spin ha-icon {
    animation: spin 2s linear infinite;
  }
  .badge {
    position: absolute;
    top: -3px;
    right: -3px;
    width: var(--badge-size);
    height: var(--badge-size);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 0;
    background-color: rgb(var(--badge-c, var(--rgb-grey)));
  }
  .badge ha-icon {
    --mdc-icon-size: calc(var(--badge-size) * 0.75);
    color: white;
  }
  .info {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  .primary,
  .secondary {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .primary {
    font-size: var(--card-primary-font-size);
    font-weight: var(--card-primary-font-weight);
    line-height: var(--card-primary-line-height);
    letter-spacing: var(--card-primary-letter-spacing);
    color: var(--card-primary-color);
  }
  .secondary {
    font-size: var(--card-secondary-font-size);
    font-weight: var(--card-secondary-font-weight);
    line-height: var(--card-secondary-line-height);
    letter-spacing: var(--card-secondary-letter-spacing);
    color: var(--card-secondary-color);
  }

  /* --- Controls row and buttons --------------------------------------------- */
  .actions {
    display: flex;
    align-items: center;
    gap: var(--control-spacing);
    padding: 0 var(--control-spacing) var(--control-spacing);
    overflow-x: auto;
    scrollbar-width: none;
  }
  .actions::-webkit-scrollbar {
    display: none;
  }
  .button {
    box-sizing: border-box;
    flex: 1 1 0;
    min-width: var(--control-height);
    height: var(--control-height);
    margin: 0;
    padding: 0 8px;
    border: none;
    border-radius: var(--control-border-radius);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font: inherit;
    font-size: var(--card-secondary-font-size);
    font-weight: var(--card-primary-font-weight);
    color: var(--primary-text-color);
    background-color: var(--tint);
    cursor: pointer;
    transition:
      background-color 280ms ease-in-out,
      color 280ms ease-in-out;
  }
  .button ha-icon {
    --mdc-icon-size: calc(var(--control-height) * 0.5);
    display: flex;
    pointer-events: none;
  }
  .button.active {
    color: rgb(var(--c));
    background-color: rgba(var(--c), 0.2);
  }
  .button.danger ha-icon {
    color: rgb(var(--rgb-red));
  }
  .button:disabled {
    cursor: not-allowed;
    color: rgb(var(--rgb-disabled));
    background-color: rgba(var(--rgb-disabled), 0.2);
  }
  .button .label {
    display: none;
    white-space: nowrap;
  }
  @container qbt (min-width: 440px) {
    .button .label {
      display: inline;
    }
  }

  /* --- Chips --------------------------------------------------------------- */
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--chip-spacing);
  }
  .chip {
    box-sizing: border-box;
    flex: none;
    height: var(--chip-height);
    min-width: var(--chip-height);
    margin: 0;
    padding: var(--chip-padding);
    padding-inline: 0.3em;
    border: none;
    border-radius: var(--chip-border-radius);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.15em;
    font: inherit;
    font-size: var(--chip-height);
    line-height: 0;
    color: var(--primary-text-color);
    background-color: var(--tint);
    cursor: pointer;
    transition: background-color 280ms ease-in-out;
  }
  .chip ha-icon {
    --mdc-icon-size: var(--chip-icon-size);
    display: flex;
    color: rgb(var(--c, var(--rgb-text)));
  }
  .chip span {
    font-size: var(--chip-font-size);
    font-weight: var(--chip-font-weight);
    line-height: 1;
    white-space: nowrap;
  }
  .chip.selected {
    color: rgb(var(--c, var(--rgb-primary-color, 3, 169, 244)));
    background-color: rgba(var(--c, var(--rgb-primary-color, 3, 169, 244)), 0.2);
  }

  /* --- Misc ---------------------------------------------------------------- */
  .clickable {
    cursor: pointer;
  }
  .icon-button {
    box-sizing: border-box;
    flex: none;
    width: var(--icon-size);
    height: var(--icon-size);
    margin: 0;
    padding: 0;
    border: none;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--secondary-text-color);
    background: none;
    cursor: pointer;
    text-decoration: none;
  }
  .icon-button:hover {
    background-color: var(--tint);
  }
  .icon-button ha-icon {
    --mdc-icon-size: 20px;
    display: flex;
  }
  .icon-button.busy ha-icon {
    animation: spin 1s linear infinite;
  }
  .button:focus-visible,
  .chip:focus-visible,
  .icon-button:focus-visible,
  .clickable:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }
  .bar {
    position: relative;
    height: 6px;
    border-radius: 3px;
    overflow: hidden;
    transform: translateZ(0);
    background-color: rgba(var(--c, var(--rgb-text)), 0.2);
  }
  .bar::after {
    content: "";
    position: absolute;
    inset: 0;
    transform: scaleX(var(--value, 0));
    transform-origin: left;
    background-color: rgb(var(--c, var(--rgb-text)));
    transition: transform 180ms ease-in-out;
  }
  .message {
    display: flex;
    align-items: center;
    gap: var(--spacing);
    padding: var(--spacing);
    font-size: var(--card-secondary-font-size);
    color: var(--secondary-text-color);
  }
  .message ha-icon {
    flex: none;
  }
  .message.error {
    color: rgb(var(--rgb-red));
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes pulse {
    50% {
      opacity: 0.4;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    * {
      animation: none !important;
      transition: none !important;
    }
  }
`;
