import { expect, test, describe, afterAll } from "vitest";
import canisterIds from "../.dfx/local/canister_ids.json";
// import mainnetIds from "../canister_ids.json";

const express = require("express");
const app = express();

const helloCanisterId = canisterIds.test.local;
// const helloCanisterId = mainnetIds.test.ic;
console.log(`canisterId: ${helloCanisterId}`);

function createUrl(path, params) {
  const url = new URL(path, `http://127.0.0.1:4943`);
  url.searchParams.set(`canisterId`, helloCanisterId);
  if (params) {
    for (const key in params) {
      url.searchParams.set(key, params[key]);
    }
  }
  // const url = new URL(path, `https://${helloCanisterId}.icp0.io`);
  return url;
}

const cats = [
  { name: "Sardine", age: 7 },
  { name: "Olive", age: 4 },
];

app.get(`/hi`, (req, res) => {
  res.send(`hi`);
});

app.get(`/json`, (req, res) => {
  res.json({ hello: `world` });
});

app.get(`/404`, (req, res) => {
  res.status(404).send(`Not found`);
});

app.get(`/`, (req, res) => {
  res.send(`<html><body><h1>hello world</h1></body></html>`);
});

app.get(`/queryParams`, (req, res) => {
  res.json(req.query);
});

app.get(`/cats`, (req, res) => {
  res.json(cats);
});

app.get(`/cats/:name`, (req, res) => {
  const cat = cats.find((cat) => cat.name === req.params.name);
  if (!cat) {
    res.status(404).send(`Not found`);
    return;
  }
  res.json(cat);
});

const server = app.listen(4999);

const awaitJson = async (url, options) => {
  const response = await fetch(url, options);
  const text = await response.text();
  try {
    const json = JSON.parse(text);
    delete json["canisterId"];
    return JSON.stringify(json);
  } catch (error) {
    console.log(error);
  }
  return text;
};

const awaitText = async (url, options) => {
  const response = await fetch(url, options);
  const text = await response.text();
  return text;
};

test(`should handle a basic greeting`, async () => {
  const text = await awaitText(createUrl(`/hi`));

  expect(text).toBe(`hi`);
});

test(`should serve html`, async () => {
  const text = await awaitText(createUrl(`/`));
  expect(text).toMatchSnapshot();
});

describe(`headers`, () => {
  test(`plaintext`, async () => {
    const response = await fetch(createUrl(`/hi`));
    expect(response.headers.get(`content-type`)).toBe(`text/plain`);
  });

  test(`json`, async () => {
    const response = await fetch(createUrl(`/json`));
    expect(response.headers.get(`content-type`)).toBe(`application/json`);
  });

  test(`html`, async () => {
    const response = await fetch(createUrl(`/`));
    expect(response.headers.get(`content-type`)).toBe(`text/html`);
  });

  test(`404`, async () => {
    const response = await fetch(createUrl(`/404`));
    expect(response.headers.get(`content-type`)).toBe(`text/plain`);

    const text = await response.text();
    expect(text).toBe(`Not found`);

    expect(response.status).toBe(404);
  });
});

describe(`compare with express`, () => {
  test(`should handle a basic greeting`, async () => {
    const text = await awaitText(`http://127.0.0.1:4999/hi`);
    const canisterText = await awaitText(createUrl(`/hi`));
    expect(text).toBe(canisterText);
  });

  test(`should serve json`, async () => {
    const json = await awaitJson(`http://127.0.0.1:4999/json`);
    const canisterJson = await awaitJson(createUrl(`/json`));
    expect(json).toEqual(canisterJson);
  });

  test(`should serve html`, async () => {
    const text = await awaitText(`http://127.0.0.1:4999/`);
    const canisterText = await awaitText(createUrl(`/`));
    expect(text).toBe(canisterText);
  });

  test(`should serve 404`, async () => {
    const response = await fetch(`http://127.0.0.1:4999/404`);
    const canisterResponse = await fetch(createUrl(`/404`));

    expect(response.status).toBe(canisterResponse.status);
    expect(response.statusText).toBe(canisterResponse.statusText);
    expect(await response.text()).toBe(await canisterResponse.text());
  });

  test(`should handle query params`, async () => {
    const json = await awaitJson(`http://127.0.0.1:4999/queryParams?foo=bar`);
    const canisterJson = await awaitJson(
      createUrl(`/queryParams`, { foo: "bar" })
    );
    expect(json).toEqual(canisterJson);

    const json2 = await awaitJson(
      `http://127.0.0.1:4999/queryParams?foo=bar&baz=qux`
    );
    const canisterJson2 = await awaitJson(
      createUrl(`/queryParams`, {
        foo: "bar",
        baz: "qux",
      })
    );
    expect(json2).toEqual(canisterJson2);
  }, 10_000);

  test(`should handle multiple cats`, async () => {
    const json = await awaitJson(`http://127.0.0.1:4999/cats`);
    const canisterJson = await awaitJson(createUrl(`/cats`));
    expect(json).toEqual(canisterJson);
  });

  test(`should handle a single cat`, async () => {
    const json = await awaitJson(`http://127.0.0.1:4999/cats/Sardine`);
    console.log(createUrl(`/cats/Sardine`));
    const canisterJson = await awaitJson(createUrl(`/cats/Sardine`));
    console.log(canisterJson);
    expect(json).toEqual(canisterJson);
  });
});

describe(`CORS`, () => {
  test(`should handle a preflight OPTIONS request correctly`, async () => {
    const url = createUrl(`/json`); // The path doesn't matter much for our wildcard handler

    // Simulate a browser's preflight request for a POST with a custom header
    const response = await fetch(url, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173", // A different origin
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type, Authorization",
      },
    });

    // Preflight should return 204 No Content
    expect(response.status).toBe(204);

    // It should not have a body
    const text = await response.text();
    expect(text).toBe(``);

    // Check for the essential CORS headers
    const headers = response.headers;
    expect(headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(headers.get("Access-Control-Allow-Headers")).toContain(
      "Authorization"
    );
  });

  test(`should include 'Access-Control-Allow-Origin' header on actual GET request`, async () => {
    const url = createUrl(`/json`);

    // Simulate the actual GET request following a successful preflight
    const response = await fetch(url, {
      method: "GET",
      headers: {
        // The browser will include the Origin header on the actual request too
        Origin: "http://localhost:5173",
      },
    });

    // The request should succeed
    expect(response.status).toBe(200);

    // The response to the actual request MUST also include the ACAO header
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");

    // Verify the body is correct, just to be sure
    const json = await response.json();
    expect(json.hello).toBe("world");
  });

  test(`should not send duplicate CORS headers (fixes the previous bug)`, async () => {
    const url = createUrl(`/json`);

    // Make a preflight request
    const optionsResponse = await fetch(url, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "GET",
      },
    });

    // The 'get' method on the Headers object returns a single value.
    // If the header was sent as '*, *', this test would fail.
    expect(optionsResponse.headers.get("Access-Control-Allow-Origin")).toBe(
      "*"
    );

    // Make the actual request
    const getResponse = await fetch(url, {
      headers: {
        Origin: "http://localhost:5173",
      },
    });

    expect(getResponse.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe(`Caching Behavior`, () => {
  test(`should follow the specified caching flow`, async () => {
    // Using two simple but distinct endpoints for the test
    const page1Url = createUrl(`/hi`);
    const page2Url = createUrl(`/json`);

    // 1. User lands on a page. The first request should be a cache MISS.
    console.log(`Step 1: First visit to page 1 (/hi)`);
    const response1 = await fetch(page1Url);
    // console.log(`Response headers:`, response1.headers);
    // expect(response1.headers.get(`x-ic-cache-status`)).toBe(`MISS`);
    expect(await response1.text()).toBe(`hi`);

    // 2. User refreshes the page. This second request should be a cache HIT.
    console.log(`Step 2: Refreshing page 1 (/hi)`);
    const response2 = await fetch(page1Url);
    console.log(`Response headers:`, response2.headers);
    // expect(response2.headers.get(`x-ic-cache-status`)).toBe(`HIT`);
    expect(await response2.text()).toBe(`hi`);

    // 3. User goes to a new page. This should be a cache MISS.
    console.log(`Step 3: Visiting a new page (/json)`);
    const response3 = await fetch(page2Url);
    expect(response3.headers.get(`x-ic-cache-status`)).toBe(`MISS`);
    const json1 = await response3.json();
    expect(json1.hello).toBe(`world`);

    // 4. User refreshes the new page. This should now be a cache HIT.
    console.log(`Step 4: Refreshing page 2 (/json)`);
    const response4 = await fetch(page2Url);
    expect(response4.headers.get(`x-ic-cache-status`)).toBe(`HIT`);
    const json2 = await response4.json();
    expect(json2.hello).toBe(`world`);
  }, 10_000); // Adding a longer timeout just in case the network is slow
});


afterAll(() => {
  server.close();
});
