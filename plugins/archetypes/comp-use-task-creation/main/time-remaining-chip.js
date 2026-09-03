// ============= time-remaining-chip.js =============
// Stabilize the native Time remaining header chip so digit ticks do not shift layout.
// Styles live in a stylesheet (not inline) so applying them does not retrigger the
// host MutationObserver, which watches `style` / `class`.

const STYLE_ID = 'fleet-time-remaining-chip';
const CHIP_MARK = 'data-fleet-time-remaining-chip';
const VALUE_MARK = 'data-fleet-time-remaining-value';
const VALUE_RE = /^\d{1,3}:\d{2}(?::\d{2})?$/;

const plugin = {
    id: 'compUseTimeRemainingChip',
    name: 'Time Remaining Chip',
    description:
        'Keeps the Time remaining countdown from shifting the header as digits change',
    _version: '1.2',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        styleInjected: false,
        missingLogged: false,
        activationLogged: false,
        hadChip: false
    },

    ensureStyle(state) {
        if (state.styleInjected || document.getElementById(STYLE_ID)) {
            state.styleInjected = true;
            return;
        }
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.setAttribute('data-fleet-plugin', this.id);
        style.textContent = [
            '[' + VALUE_MARK + '="1"] {',
            '  display: inline-block;',
            '  font-variant-numeric: tabular-nums;',
            '  font-feature-settings: "tnum";',
            '  text-align: center;',
            '  box-sizing: content-box;',
              '  min-width: 8ch;',
            '  padding-left: 5px;',
            '  padding-right: 5px;',
            '}'
        ].join('\n');
        (document.head || document.documentElement).appendChild(style);
        if (typeof CleanupRegistry !== 'undefined' && CleanupRegistry.registerElement) {
            CleanupRegistry.registerElement(style);
        }
        state.styleInjected = true;
    },

    findLabel() {
        const spans = document.querySelectorAll('span');
        for (let i = 0; i < spans.length; i++) {
            const text = (spans[i].textContent || '').trim().toLowerCase();
            if (text.startsWith('time remaining:')) {
                return spans[i];
            }
        }
        return null;
    },

    findValue(label) {
        if (!label) return null;
        const sibling = label.nextElementSibling;
        if (sibling && sibling.tagName === 'SPAN') {
            const text = (sibling.textContent || '').trim();
            if (VALUE_RE.test(text)) return sibling;
        }
        return label;
    },

    apply(label) {
        const value = this.findValue(label);
        if (!value) return false;
        if (value.getAttribute(VALUE_MARK) === '1' && label.getAttribute(CHIP_MARK) === '1') {
            return false;
        }
        label.setAttribute(CHIP_MARK, '1');
        value.setAttribute(VALUE_MARK, '1');
        return true;
    },

    onMutation(state) {
        this.ensureStyle(state);
        const label = this.findLabel();
        if (!label) {
            if (state.hadChip) {
                Logger.debug('time remaining chip left DOM');
                state.hadChip = false;
                state.activationLogged = false;
            }
            if (!state.missingLogged) {
                Logger.debug('time remaining chip not found yet');
                state.missingLogged = true;
            }
            return;
        }

        state.missingLogged = false;
        state.hadChip = true;
        const applied = this.apply(label);
        if (applied && !state.activationLogged) {
            Logger.log('time remaining chip width stabilized');
            state.activationLogged = true;
        }
    }
};
