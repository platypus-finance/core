'use strict';

/**
 * A simple fuzzer that executes against actions w.r.t. constraints.
 * Constraints share state and create parameters for actions.
 */
class Fuzzer {
  constructor(actions, constraintsState, constraints, invariants) {
    // { action => fn(params) }
    this.actionMap = actions;
    this.actions = Object.keys(actions);
    // { action => state => [...params of action] }
    this.constraints = constraints;
    // shared state between constraints.
    this.constraintsState = constraintsState;
    // invariants to check after every step.
    this.invariants = invariants;
    // history of action, params, and results
    this.history = [];
  }

  choose() {
    return this.actions[Math.floor(Math.random() * this.actions.length)];
  }

  constraint(action) {
    return this.constraints[action](this.constraintsState);
  }

  async checkInvariants() {
    for (let j = 0; j < this.invariants.length; j++) {
      let inv = this.invariants[j];
      if (!(await inv())) {
        throw new Error(`Invariant ${inv.name} is violated`);
      }
    }
  }

  // Perform a step with bookkeeping.
  // Randomly draw an action and execute it with parameters from constraints.
  async step() {
    let action = this.choose();
    this.history.push(action);
    let params = this.constraint(action);
    this.history.push(params);
    try {
      let result = await this.actionMap[action].apply(undefined, params);
      this.history.push(result);
    } catch (error) {
      // Continue if this is a revert, else rethrow.
      let errMsg = error.message;
      if (errMsg.includes('revert')) {
        this.history.push(errMsg);
      } else {
        throw error;
      }
    }
  }

  // Execute for a number of steps. Perform invariant checks after every step.
  // Print history on error.
  async execute(steps) {
    for (let i = 0; i < steps; i++) {
      try {
        await this.step();
        await this.checkInvariants();
      } catch (error) {
        console.log('Received error: ', error);
        console.log('Debug log: ');
        this.printHistory();
        throw error;
      }
    }
  }

  printHistory() {
    let history = this.history;
    for (let i = 0; i < history.length; i += 3) {
      let action = history[i];
      let param = history[i + 1];
      let result = history[i + 2];
      console.log(`${action}(${param}) => ${JSON.stringify(result)}\n`);
    }
  }
}

module.exports = Fuzzer;
