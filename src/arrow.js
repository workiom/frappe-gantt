import { createSVG } from './svg_utils';

export default class Arrow {
    constructor(gantt, from_task, to_task) {
        this.gantt = gantt;
        this.from_task = from_task;
        this.to_task = to_task;
        this.is_critical = this.check_critical_path();
        this.is_invalid = this.check_invalid_dependency();

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
        const dependencies_type = this.to_task.task.dependencies_type ||
                                  this.gantt.options.dependencies_type;

        // Fixed dependencies use old logic
        if (dependencies_type === 'fixed') {
            return this.to_task.$bar.getX() < this.from_task.$bar.getX();
        }

        const parent_task = this.from_task.task;
        const child_task = this.to_task.task;

        switch(dependencies_type) {
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
        let start_x =
            this.from_task.$bar.getX() + this.from_task.$bar.getWidth() / 2;

        const condition = () =>
            this.to_task.$bar.getX() < start_x + this.gantt.options.padding &&
            start_x > this.from_task.$bar.getX() + this.gantt.options.padding;

        while (condition()) {
            start_x -= 10;
        }
        start_x -= 10;

        let start_y =
            this.gantt.config.header_height +
            this.gantt.options.bar_height +
            (this.gantt.options.padding + this.gantt.options.bar_height) *
                this.from_task.task._index +
            this.gantt.options.padding / 2;

        let end_x = this.to_task.$bar.getX() - 13;
        let end_y =
            this.gantt.config.header_height +
            this.gantt.options.bar_height / 2 +
            (this.gantt.options.padding + this.gantt.options.bar_height) *
                this.to_task.task._index +
            this.gantt.options.padding / 2;

        const from_is_below_to =
            this.from_task.task._index > this.to_task.task._index;

        let curve = this.gantt.options.arrow_curve;
        const clockwise = from_is_below_to ? 1 : 0;
        let curve_y = from_is_below_to ? -curve : curve;

        if (
            this.to_task.$bar.getX() <=
            this.from_task.$bar.getX() + this.gantt.options.padding
        ) {
            let down_1 = this.gantt.options.padding / 2 - curve;
            if (down_1 < 0) {
                down_1 = 0;
                curve = this.gantt.options.padding / 2;
                curve_y = from_is_below_to ? -curve : curve;
            }
            const down_2 =
                this.to_task.$bar.getY() +
                this.to_task.$bar.getHeight() / 2 -
                curve_y;
            const left = this.to_task.$bar.getX() - this.gantt.options.padding;
            this.path = `
                M ${start_x} ${start_y}
                v ${down_1}
                a ${curve} ${curve} 0 0 1 ${-curve} ${curve}
                H ${left}
                a ${curve} ${curve} 0 0 ${clockwise} ${-curve} ${curve_y}
                V ${down_2}
                a ${curve} ${curve} 0 0 ${clockwise} ${curve} ${curve_y}
                L ${end_x} ${end_y}
                m -5 -5
                l 5 5
                l -5 5`;
        } else {
            if (end_x < start_x + curve) curve = end_x - start_x;

            let offset = from_is_below_to ? end_y + curve : end_y - curve;

            this.path = `
              M ${start_x} ${start_y}
              V ${offset}
              a ${curve} ${curve} 0 0 ${clockwise} ${curve} ${curve}
              L ${end_x} ${end_y}
              m -5 -5
              l 5 5
              l -5 5`;
        }
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
    }

    update() {
        this.calculate_path();
        this.element.setAttribute('d', this.path);

        // Update invalid state
        this.is_invalid = this.check_invalid_dependency();

        // Update class
        let arrowClass = '';
        if (this.is_invalid) {
            arrowClass = 'arrow-invalid';
        } else if (this.is_critical) {
            arrowClass = 'arrow-critical';
        }
        this.element.setAttribute('class', arrowClass);
    }
}
