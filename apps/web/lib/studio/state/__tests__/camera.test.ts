import { beforeEach, describe, expect, it } from "vitest";

import {
  __resetCameraState,
  getCameraHomeRequests,
  requestCameraHome,
  subscribeCameraHome,
} from "../camera";

describe("camera home-request store", () => {
  beforeEach(() => {
    __resetCameraState();
  });

  it("starts at zero requests", () => {
    expect(getCameraHomeRequests()).toBe(0);
  });

  it("requestCameraHome bumps the counter", () => {
    requestCameraHome();
    expect(getCameraHomeRequests()).toBe(1);
    requestCameraHome();
    expect(getCameraHomeRequests()).toBe(2);
  });

  it("notifies subscribers once per request", () => {
    let calls = 0;
    const unsub = subscribeCameraHome(() => {
      calls += 1;
    });

    requestCameraHome();
    requestCameraHome();

    unsub();
    requestCameraHome(); // after unsub → no notify

    expect(calls).toBe(2);
    expect(getCameraHomeRequests()).toBe(3);
  });

  it("__resetCameraState clears the counter and subscribers", () => {
    let calls = 0;
    subscribeCameraHome(() => {
      calls += 1;
    });
    requestCameraHome();
    expect(calls).toBe(1);

    __resetCameraState();
    expect(getCameraHomeRequests()).toBe(0);

    requestCameraHome(); // old subscriber was cleared → no notify
    expect(calls).toBe(1);
  });
});
