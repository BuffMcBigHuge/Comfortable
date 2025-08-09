import type { Route } from "./+types/home";
import App from "../App.jsx";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Comfortable" },
    { name: "description", content: "ComfyUI Video Workflow Analyzer & Export" },
  ];
}

export default function Home() {
  return <App />;
}
