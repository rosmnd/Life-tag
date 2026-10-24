import { createFileRoute } from "@tanstack/react-router";
import { Page } from "../site/Page";

export const Route = createFileRoute("/track")({ component: () => <Page /> });
