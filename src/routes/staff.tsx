import { createFileRoute } from "@tanstack/react-router";
import { StaffPage } from "../site/StaffPage";

export const Route = createFileRoute("/staff")({ component: StaffPage });
