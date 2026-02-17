import './index.css';
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AuthProvider } from "./contexts/AuthContext";

const container = document.getElementById("root");
if (container) {
	const root = createRoot(container);
	root.render(
		<AuthProvider>
			<App />
		</AuthProvider>
	);
}