import { createSVG } from './svg_utils';

export default class Arrow {
    constructor(gantt, from_task, to_task, dependency_type) {
        this.gantt = gantt;
        this.from_task = from_task;
        this.to_task = to_task;
        this.dependency_type = dependency_type;
        this.is_critical = this.check_critical_path();
        this.is_invalid = this.check_invalid_dependency();
        this.is_hovered = false;
        this.is_active = false;

        this.calculate_path();
        this.draw();
    }

    check_critical_path() {
        if (!this.gantt.options.critical_path) return false;

        // Check if both from_task and to_task are on the critical path
        return this.from_task.task._is_critical === true &&
               this.to_task.task._is_critical === true;
    }

    check_invalid_dependency() {
        const dependency_type = this.dependency_type;
        const parent_task = this.from_task.task;
        const child_task = this.to_task.task;

        switch(dependency_type) {
            case 'finish-to-start':
                // Child task cannot start before parent finishes
                return child_task._start < parent_task._end;

            case 'start-to-start':
                // Child task cannot start before parent starts
                return child_task._start < parent_task._start;

            case 'finish-to-finish':
                // Child task cannot finish before parent finishes
                return child_task._end < parent_task._end;

            case 'start-to-finish':
                // Child task cannot finish before parent starts
                return child_task._end < parent_task._start;
        }

        return false;
    }

    calculate_path() {
        const opt = this.gantt.options;
        const cfg = this.gantt.config;
        const curve = opt.arrow_curve;
        const padding = opt.padding;

        // Anchor x positions
        const right_A = this.from_task.$bar.getX() + this.from_task.$bar.getWidth();
        const left_A  = this.from_task.$bar.getX();
        const right_B = this.to_task.$bar.getX() + this.to_task.$bar.getWidth();
        const left_B  = this.to_task.$bar.getX();

        // Anchor y positions — vertical center of each bar row
        const row_center = (task) =>
            cfg.header_height +
            opt.bar_height / 2 +
            (opt.padding + opt.bar_height) * task.task._index +
            opt.padding / 2;

        const y_A = row_center(this.from_task);
        const y_B = row_center(this.to_task);
        const y_mid = (y_A + y_B) / 2;

        switch (this.dependency_type) {
            case 'finish-to-start':
                this.path = this._path_finish_to_start(
                    right_A, left_A, right_B, left_B, y_A, y_B, y_mid, padding, curve
                );
                this.label_pos = { x: left_B, y: y_B, side: 'left' };
                break;
            case 'start-to-start':
                this.path = this._path_start_to_start(
                    left_A, left_B, y_A, y_B, padding, curve
                );
                this.label_pos = { x: left_B, y: y_B, side: 'left' };
                break;
            case 'finish-to-finish':
                this.path = this._path_finish_to_finish(
                    right_A, right_B, y_A, y_B, padding, curve
                );
                this.label_pos = { x: right_B, y: y_B, side: 'right' };
                break;
            case 'start-to-finish':
                this.path = this._path_start_to_finish(
                    left_A, right_B, y_A, y_B, y_mid, padding, curve
                );
                this.label_pos = { x: right_B, y: y_B, side: 'right' };
                break;
            default:
                this.path = this._path_finish_to_start(
                    right_A, left_A, right_B, left_B, y_A, y_B, y_mid, padding, curve
                );
                this.label_pos = { x: left_B, y: y_B, side: 'left' };
        }
    }

    _path_finish_to_start(right_A, left_A, right_B, left_B, y_A, y_B, y_mid, padding, curve) {
        const x_right = right_A + padding;
        const going_up = y_B < y_A;

        if (x_right < left_B) {
            // Case 1: gap between tasks — 3 segments: right, vertical, right
            if (!going_up) {
                return `
            M ${right_A} ${y_A}
            H ${x_right - curve}
            a ${curve} ${curve} 0 0 1 ${curve} ${curve}
            V ${y_B - curve}
            a ${curve} ${curve} 0 0 0 ${curve} ${curve}
            H ${left_B}
            m -5 -5 l 5 5 l -5 5`;
            }
            return `
            M ${right_A} ${y_A}
            H ${x_right - curve}
            a ${curve} ${curve} 0 0 0 ${curve} ${-curve}
            V ${y_B + curve}
            a ${curve} ${curve} 0 0 1 ${curve} ${-curve}
            H ${left_B}
            m -5 -5 l 5 5 l -5 5`;
        }

        // Case 2: overlap — 5 segments: right, vertical, left, vertical, right
        const x_left = left_B - padding;
        if (!going_up) {
            return `
            M ${right_A} ${y_A}
            H ${x_right - curve}
            a ${curve} ${curve} 0 0 1 ${curve} ${curve}
            V ${y_mid - curve}
            a ${curve} ${curve} 0 0 1 ${-curve} ${curve}
            H ${x_left + curve}
            a ${curve} ${curve} 0 0 0 ${-curve} ${curve}
            V ${y_B - curve}
            a ${curve} ${curve} 0 0 0 ${curve} ${curve}
            H ${left_B}
            m -5 -5 l 5 5 l -5 5`;
        }
        return `
            M ${right_A} ${y_A}
            H ${x_right - curve}
            a ${curve} ${curve} 0 0 0 ${curve} ${-curve}
            V ${y_mid + curve}
            a ${curve} ${curve} 0 0 0 ${-curve} ${-curve}
            H ${x_left + curve}
            a ${curve} ${curve} 0 0 1 ${-curve} ${-curve}
            V ${y_B + curve}
            a ${curve} ${curve} 0 0 1 ${curve} ${-curve}
            H ${left_B}
            m -5 -5 l 5 5 l -5 5`;
    }

    _path_start_to_start(left_A, left_B, y_A, y_B, padding, curve) {
        const x_left = Math.min(left_A, left_B) - padding;
        const going_up = y_B < y_A;

        if (!going_up) {
            return `
            M ${left_A} ${y_A}
            H ${x_left + curve}
            a ${curve} ${curve} 0 0 0 ${-curve} ${curve}
            V ${y_B - curve}
            a ${curve} ${curve} 0 0 0 ${curve} ${curve}
            H ${left_B}
            m -5 -5 l 5 5 l -5 5`;
        }
        return `
            M ${left_A} ${y_A}
            H ${x_left + curve}
            a ${curve} ${curve} 0 0 1 ${-curve} ${-curve}
            V ${y_B + curve}
            a ${curve} ${curve} 0 0 1 ${curve} ${-curve}
            H ${left_B}
            m -5 -5 l 5 5 l -5 5`;
    }

    _path_finish_to_finish(right_A, right_B, y_A, y_B, padding, curve) {
        const x_right = Math.max(right_A, right_B) + padding;
        const going_up = y_B < y_A;

        if (!going_up) {
            return `
            M ${right_A} ${y_A}
            H ${x_right - curve}
            a ${curve} ${curve} 0 0 1 ${curve} ${curve}
            V ${y_B - curve}
            a ${curve} ${curve} 0 0 1 ${-curve} ${curve}
            H ${right_B}
            m 5 -5 l -5 5 l 5 5`;
        }
        return `
            M ${right_A} ${y_A}
            H ${x_right - curve}
            a ${curve} ${curve} 0 0 0 ${curve} ${-curve}
            V ${y_B + curve}
            a ${curve} ${curve} 0 0 0 ${-curve} ${-curve}
            H ${right_B}
            m 5 -5 l -5 5 l 5 5`;
    }

    _path_start_to_finish(left_A, right_B, y_A, y_B, y_mid, padding, curve) {
        const x_left  = left_A - padding;
        const x_right = right_B + padding;
        const going_up = y_B < y_A;
        // crossed: from-task is to the right of to-task — not enough room for mid-column detour
        const crossed = x_right < x_left + 2 * curve;

        if (!crossed) {
            if (!going_up) {
                return `
            M ${left_A} ${y_A}
            H ${x_left + curve}
            a ${curve} ${curve} 0 0 0 ${-curve} ${curve}
            V ${y_mid - curve}
            a ${curve} ${curve} 0 0 0 ${curve} ${curve}
            H ${x_right - curve}
            a ${curve} ${curve} 0 0 1 ${curve} ${curve}
            V ${y_B - curve}
            a ${curve} ${curve} 0 0 1 ${-curve} ${curve}
            H ${right_B}
            m 5 -5 l -5 5 l 5 5`;
            }
            return `
            M ${left_A} ${y_A}
            H ${x_left + curve}
            a ${curve} ${curve} 0 0 1 ${-curve} ${-curve}
            V ${y_mid + curve}
            a ${curve} ${curve} 0 0 1 ${curve} ${-curve}
            H ${x_right - curve}
            a ${curve} ${curve} 0 0 0 ${curve} ${-curve}
            V ${y_B + curve}
            a ${curve} ${curve} 0 0 0 ${-curve} ${-curve}
            H ${right_B}
            m 5 -5 l -5 5 l 5 5`;
        }

        if (!going_up) {
            return `
            M ${left_A} ${y_A}
            H ${x_left + curve}
            a ${curve} ${curve} 0 0 0 ${-curve} ${curve}
            V ${y_B - curve}
            a ${curve} ${curve} 0 0 1 ${-curve} ${curve}
            H ${right_B}
            m 5 -5 l -5 5 l 5 5`;
        }
        return `
            M ${left_A} ${y_A}
            H ${x_left + curve}
            a ${curve} ${curve} 0 0 1 ${-curve} ${-curve}
            V ${y_B + curve}
            a ${curve} ${curve} 0 0 0 ${-curve} ${-curve}
            H ${right_B}
            m 5 -5 l -5 5 l 5 5`;
    }

    _get_connected_bars() {
        const from_id = this.from_task.task.id;
        const to_id   = this.to_task.task.id;
        return Array.from(
            this.gantt.$svg.querySelectorAll(
                `[data-id="${CSS.escape(from_id)}"], [data-id="${CSS.escape(to_id)}"]`
            )
        );
    }

    draw() {
        let arrowClass = '';
        if (this.is_invalid) {
            arrowClass = 'arrow-invalid';
        } else if (this.is_critical) {
            arrowClass = 'arrow-critical';
        }

        this.element = createSVG('path', {
            d: this.path,
            'data-from': this.from_task.task.id,
            'data-to': this.to_task.task.id,
            class: arrowClass,
        });

        // Wide transparent path for easier mouse targeting
        this.hit_element = createSVG('path', {
            d: this.path,
            stroke: 'transparent',
            'stroke-width': 15,
            fill: 'none',
            style: 'pointer-events: stroke; cursor: pointer;',
        });

        this.hit_element.addEventListener('mouseenter', () => {
            this.is_hovered = true;
            this.element.classList.add('arrow-hover');
            const bar_class = this.is_invalid
                ? 'bar-arrow-invalid'
                : this.is_critical
                ? 'bar-arrow-critical'
                : 'bar-arrow-hover';
            this._get_connected_bars().forEach(el => {
                const bar = el.querySelector('.bar');
                if (bar) bar.classList.add(bar_class);
            });
            this._show_label();
        });

        this.hit_element.addEventListener('mouseleave', () => {
            this.is_hovered = false;
            this.element.classList.remove('arrow-hover');
            this._get_connected_bars().forEach(el => {
                const bar = el.querySelector('.bar');
                if (bar) {
                    bar.classList.remove('bar-arrow-hover');
                    if (!this.is_active) {
                        bar.classList.remove('bar-arrow-critical', 'bar-arrow-invalid');
                    }
                }
            });
            if (!this.is_active && !this.is_hovered) this._hide_label();
        });

        this.hit_element.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.is_active) {
                this.gantt.set_active_arrow(null);
            } else {
                this.gantt.set_active_arrow(this);
            }
        });
    }

    _get_type_abbr() {
        const map = {
            'finish-to-start': 'FS',
            'start-to-start': 'SS',
            'finish-to-finish': 'FF',
            'start-to-finish': 'SF',
        };
        return map[this.dependency_type] || 'FS';
    }

    _show_label() {
        if (this.label_element) return;
        const abbr = this._get_type_abbr();
        const w = 21;
        const h = 20;
        const { x: tip_x, y: tip_y, side } = this.label_pos;
        const cx = side === 'left'
            ? tip_x - 10 - w / 2
            : tip_x + 10 + w / 2;
        const cy = tip_y;

        this.label_element = createSVG('g', { class: 'arrow-type-label' });
        const bg = createSVG('rect', {
            x: cx - w / 2,
            y: cy - h / 2,
            width: w,
            height: h,
            rx: 3,
        });
        const text = createSVG('text', {
            x: cx,
            y: cy,
            'dominant-baseline': 'middle',
            'text-anchor': 'middle',
        });
        text.textContent = abbr;
        this.label_element.appendChild(bg);
        this.label_element.appendChild(text);
        this.label_element.addEventListener('mouseenter', () => {
            this.hit_element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
        });
        this.label_element.addEventListener('mouseleave', () => {
            this.hit_element.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
        });
        this.label_element.addEventListener('click', (e) => {
            e.stopPropagation();
            this.hit_element.dispatchEvent(new MouseEvent('click', { bubbles: false }));
        });
        this.gantt.layers.arrow.appendChild(this.label_element);
    }

    _hide_label() {
        if (this.label_element) {
            this.label_element.remove();
            this.label_element = null;
        }
    }

    activate() {
        this.is_active = true;
        this.element.classList.add('arrow-active');
        this._show_label();
        const bar_class = this.is_invalid
            ? 'bar-arrow-invalid'
            : this.is_critical
            ? 'bar-arrow-critical'
            : 'bar-arrow-active';
        this._get_connected_bars().forEach(el => {
            const bar = el.querySelector('.bar');
            if (bar) bar.classList.add(bar_class);
        });
    }

    deactivate() {
        this.is_active = false;
        this.element.classList.remove('arrow-active');
        this._hide_label();
        this._get_connected_bars().forEach(el => {
            const bar = el.querySelector('.bar');
            if (bar) bar.classList.remove('bar-arrow-active', 'bar-arrow-critical', 'bar-arrow-invalid');
        });
    }

    update() {
        this.calculate_path();
        this.element.setAttribute('d', this.path);
        this.hit_element.setAttribute('d', this.path);

        // Update invalid state
        this.is_invalid = this.check_invalid_dependency();

        // Update class
        let arrowClass = '';
        if (this.is_invalid) {
            arrowClass = 'arrow-invalid';
        } else if (this.is_critical) {
            arrowClass = 'arrow-critical';
        }
        if (this.is_hovered) arrowClass += ' arrow-hover';
        if (this.is_active) arrowClass += ' arrow-active';
        this.element.setAttribute('class', arrowClass.trim());
    }
}
