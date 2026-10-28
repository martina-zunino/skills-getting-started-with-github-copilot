const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");

class Element {
  constructor() {
    this.children = [];
    this.listeners = {};
    this.value = "";
    this.textContent = "";
    this.classList = { add() {}, remove() {} };
  }

  set innerHTML(value) {
    this.children = [];
    this.textContent = value;
  }

  get options() {
    return this.children;
  }

  append(...children) {
    this.children.push(...children);
  }

  appendChild(child) {
    this.append(child);
  }

  remove(index) {
    this.children.splice(index, 1);
  }

  addEventListener(event, listener) {
    this.listeners[event] = listener;
  }

  setAttribute() {}
}

function text(element) {
  if (typeof element === "string") return element;
  return element.textContent + element.children.map(text).join("");
}

async function setup({ rejectSignup = false } = {}) {
  const elements = Object.fromEntries(
    ["activities-list", "activity", "signup-form", "email", "message"].map(
      (id) => [id, new Element()]
    )
  );
  elements.activity.appendChild(new Element());
  let resets = 0;
  elements["signup-form"].reset = () => {
    resets++;
    elements.email.value = "";
    elements.activity.value = "";
  };
  const activities = {
    "Chess Club": {
      description: "Play chess",
      schedule: "Fridays",
      max_participants: 12,
      participants: [],
    },
  };
  const requests = [];
  runInNewContext(
    readFileSync(require.resolve("../static/app.js"), "utf8"),
    {
      document: {
        getElementById: (id) => elements[id],
        createElement: () => new Element(),
        createElementNS: () => new Element(),
        addEventListener: (event, listener) => listener(),
      },
      fetch: async (url, options) => {
        requests.push({ url, method: options?.method || "GET" });
        if (options?.method === "POST") {
          if (rejectSignup) {
            return {
              ok: false,
              json: async () => ({ detail: "Student is already signed up" }),
            };
          }
          const email = new URL(url, "http://localhost").searchParams.get("email");
          activities["Chess Club"].participants.push(email);
          return {
            ok: true,
            json: async () => ({ message: "Signed up successfully" }),
          };
        }
        return {
          ok: true,
          json: async () => structuredClone(activities),
        };
      },
      setTimeout() {},
      console,
    }
  );
  await new Promise(setImmediate);
  return {
    elements,
    requests,
    get resets() {
      return resets;
    },
    async signup(email) {
      elements.email.value = email;
      elements.activity.value = "Chess Club";
      await elements["signup-form"].listeners.submit({ preventDefault() {} });
    },
  };
}

test("signup refreshes participants and availability without a page reload", async () => {
  const app = await setup();
  assert.match(text(app.elements["activities-list"]), /12 spots left/);
  assert.match(text(app.elements["activities-list"]), /No participants yet/);

  await app.signup("student+chess@mergington.edu");

  const card = text(app.elements["activities-list"]);
  assert.match(card, /student\+chess@mergington\.edu/);
  assert.match(card, /11 spots left/);
  assert.doesNotMatch(card, /No participants yet/);
  assert.deepEqual(app.requests.map(({ method }) => method), ["GET", "POST", "GET"]);
  assert.equal(
    app.requests[1].url,
    "/activities/Chess%20Club/signup?email=student%2Bchess%40mergington.edu"
  );
  assert.equal(app.resets, 1);
  assert.equal(app.elements.message.className, "success");
});

test("repeated signups do not duplicate activity cards or dropdown options", async () => {
  const app = await setup();
  await app.signup("first@mergington.edu");
  await app.signup("second@mergington.edu");

  assert.equal(app.elements["activities-list"].children.length, 1);
  assert.equal(app.elements.activity.options.length, 2);
  assert.equal(app.elements.activity.options[1].value, "Chess Club");
  const card = text(app.elements["activities-list"]);
  assert.match(card, /first@mergington\.edu/);
  assert.match(card, /second@mergington\.edu/);
  assert.match(card, /10 spots left/);
});

test("failed signup preserves the form and does not refresh activities", async () => {
  const app = await setup({ rejectSignup: true });
  await app.signup("existing@mergington.edu");

  assert.deepEqual(app.requests.map(({ method }) => method), ["GET", "POST"]);
  assert.equal(app.resets, 0);
  assert.equal(app.elements.email.value, "existing@mergington.edu");
  assert.equal(app.elements.activity.value, "Chess Club");
  assert.equal(app.elements.message.className, "error");
  assert.equal(app.elements.message.textContent, "Student is already signed up");
  assert.match(text(app.elements["activities-list"]), /12 spots left/);
});
