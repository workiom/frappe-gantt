/**
 * Computes how much each dependent task should shift after a task is dragged.
 *
 * @param {object[]} tasks       - Full gantt tasks array (each with _start, _end as Date, id, dependencies)
 * @param {string}   movedTaskId - ID of the task that was dragged
 * @param {number}   deltaMs     - Net movement in milliseconds (negative = moved earlier)
 * @param {string}   mode        - Value of options.dependency_shifting
 * @returns {Map<string, number>} taskId → deltaMs to apply (movedTaskId is excluded)
 */
export function compute_dependency_shifts(tasks, movedTaskId, deltaMs, mode) {
    if (mode === 'none' || deltaMs === 0) return new Map();

    // Build graph
    const taskById = new Map();
    const predecessors = new Map(); // taskId -> [{ id, type }]
    const successors = new Map();   // taskId -> [{ id, type }]

    for (const task of tasks) {
        if (task._has_no_dates) continue;
        taskById.set(task.id, task);
        predecessors.set(task.id, []);
        successors.set(task.id, []);
    }

    for (const task of tasks) {
        if (task._has_no_dates) continue;
        for (const dep of task.dependencies || []) {
            if (!taskById.has(dep.id)) continue;
            const type = dep.type || 'finish-to-start';
            predecessors.get(task.id).push({ id: dep.id, type });
            successors.get(dep.id).push({ id: task.id, type });
        }
    }

    if (mode === 'maintain_buffer_all') {
        return _bfs_shift(movedTaskId, deltaMs, predecessors, successors, true);
    }
    if (mode === 'maintain_buffer_downstream') {
        return _bfs_shift(movedTaskId, deltaMs, predecessors, successors, false);
    }
    if (mode === 'consume_buffer') {
        return _consume_buffer_shift(movedTaskId, deltaMs, taskById, predecessors, successors);
    }

    return new Map();
}

/**
 * BFS traversal: applies the same deltaMs to every reachable task.
 * bidirectional=true visits both upstream and downstream; false visits downstream only.
 */
function _bfs_shift(movedTaskId, deltaMs, predecessors, successors, bidirectional) {
    const result = new Map();
    const visited = new Set([movedTaskId]);
    const queue = [];

    const enqueue = (neighbors) => {
        for (const { id } of neighbors) {
            if (!visited.has(id)) {
                visited.add(id);
                queue.push(id);
            }
        }
    };

    enqueue(successors.get(movedTaskId) || []);
    if (bidirectional) enqueue(predecessors.get(movedTaskId) || []);

    while (queue.length > 0) {
        const id = queue.shift();
        result.set(id, deltaMs);
        enqueue(successors.get(id) || []);
        if (bidirectional) enqueue(predecessors.get(id) || []);
    }

    return result;
}

/**
 * Dependency-type-aware shifting.
 * Forward pass (topological order): shift downstream tasks by the minimum needed to resolve conflicts.
 * Backward pass (reverse topological order): pull upstream tasks earlier if needed.
 * Diamond resolution: when multiple predecessors propose a shift, take the maximum.
 */
function _consume_buffer_shift(movedTaskId, deltaMs, taskById, predecessors, successors) {
    // Kahn's algorithm for topological order
    const in_degree = new Map();
    for (const [id] of taskById) {
        in_degree.set(id, (predecessors.get(id) || []).length);
    }

    const topo_order = [];
    const queue = [];
    for (const [id, deg] of in_degree) {
        if (deg === 0) queue.push(id);
    }
    while (queue.length > 0) {
        const id = queue.shift();
        topo_order.push(id);
        for (const { id: succId } of successors.get(id) || []) {
            const new_deg = in_degree.get(succId) - 1;
            in_degree.set(succId, new_deg);
            if (new_deg === 0) queue.push(succId);
        }
    }

    // The moved task's dates are already updated by date_changed() before this
    // function is called, so its effective shift is 0 — no double-counting.
    const shifts = new Map([[movedTaskId, 0]]);

    // Helpers: effective timestamps accounting for accumulated shifts
    const eff_start = (id) => taskById.get(id)._start.getTime() + (shifts.get(id) || 0);
    const eff_end = (id) => taskById.get(id)._end.getTime() + (shifts.get(id) || 0);

    // Forward pass: push downstream tasks later when a conflict exists
    for (const id of topo_order) {
        if (id === movedTaskId) continue;
        let max_shift = 0;
        for (const { id: predId, type } of predecessors.get(id) || []) {
            const needed = _conflict_shift(predId, id, type, eff_start, eff_end);
            if (needed > max_shift) max_shift = needed;
        }
        if (max_shift > 0) {
            shifts.set(id, (shifts.get(id) || 0) + max_shift);
        }
    }

    // Backward pass: pull upstream tasks earlier when a conflict exists
    for (let i = topo_order.length - 1; i >= 0; i--) {
        const id = topo_order[i];
        if (id === movedTaskId) continue;
        let max_pull = 0; // most-negative value wins (furthest earlier)
        for (const { id: succId, type } of successors.get(id) || []) {
            const needed = _conflict_shift(id, succId, type, eff_start, eff_end);
            // If a forward conflict exists for this pair, the predecessor must shift earlier
            if (needed > 0) {
                const pull = -needed;
                if (pull < max_pull) max_pull = pull;
            }
        }
        if (max_pull < 0) {
            shifts.set(id, (shifts.get(id) || 0) + max_pull);
        }
    }

    // Return map without the moved task (caller already applied its shift)
    const result = new Map();
    for (const [id, shift] of shifts) {
        if (id !== movedTaskId && shift !== 0) {
            result.set(id, shift);
        }
    }
    return result;
}

/**
 * Returns the positive millisecond shift needed to resolve a conflict between pred and succ,
 * based on the dependency type. Returns 0 if no conflict.
 */
function _conflict_shift(predId, succId, type, eff_start, eff_end) {
    const pred_start = eff_start(predId);
    const pred_end = eff_end(predId);
    const succ_start = eff_start(succId);
    const succ_end = eff_end(succId);

    switch (type) {
        case 'finish-to-start':
            return pred_end > succ_start ? pred_end - succ_start : 0;
        case 'start-to-start':
            return pred_start > succ_start ? pred_start - succ_start : 0;
        case 'finish-to-finish':
            return pred_end > succ_end ? pred_end - succ_end : 0;
        case 'start-to-finish':
            return pred_start > succ_end ? pred_start - succ_end : 0;
        default:
            return pred_end > succ_start ? pred_end - succ_start : 0;
    }
}
