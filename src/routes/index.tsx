import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import markup from "../site/markup.html?raw";

export const Route = createFileRoute("/")({ component: Home });

type LifeTagWindow = Window & { LifeTag?: { init: () => void } };

function Home() {
  useEffect(() => {
    let alive = true;
    const start = () => {
      if (alive) (window as LifeTagWindow).LifeTag?.init();
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

  return <div id="lifetag" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: markup }} />;
}
