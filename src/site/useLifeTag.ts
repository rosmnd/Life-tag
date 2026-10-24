import { useEffect } from "react";
import { payloadOf } from "../lib/payload";
import { validateOrderProfile } from "../lib/order-validation";

type LifeTagWindow = Window & {
  LifeTag?: {
    init: (buildPayload: typeof payloadOf, validateProfile: typeof validateOrderProfile) => void;
  };
};

export function useLifeTag() {
  useEffect(() => {
    let alive = true;
    const start = () => {
      if (alive) (window as LifeTagWindow).LifeTag?.init(payloadOf, validateOrderProfile);
    };

    if ((window as LifeTagWindow).LifeTag) {
      start();
      return () => {
        alive = false;
      };
    }

    let script = document.querySelector<HTMLScriptElement>("script[data-lifetag]");
    if (!script) {
      script = document.createElement("script");
      script.src = "/js/site.js";
      script.dataset.lifetag = "1";
      script.onload = start;
      document.body.appendChild(script);
    } else {
      script.addEventListener("load", start);
    }

    return () => {
      alive = false;
      script?.removeEventListener("load", start);
    };
  }, []);
}
