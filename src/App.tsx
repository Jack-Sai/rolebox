import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { Toaster } from "./components/Toaster";
import { CharacterEditPage } from "./pages/CharacterEditPage";
import { CharacterListPage } from "./pages/CharacterListPage";
import { ChatPage } from "./pages/ChatPage";
import { SessionCreatePage } from "./pages/SessionCreatePage";
import { SessionListPage } from "./pages/SessionListPage";
import { SettingsPage } from "./pages/SettingsPage";

export default function App() {
  return (
    <HashRouter>
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Navigate to="/characters" replace />} />
            <Route path="/characters" element={<CharacterListPage />} />
            <Route path="/characters/new" element={<CharacterEditPage />} />
            <Route path="/characters/:id/edit" element={<CharacterEditPage />} />
            <Route path="/sessions" element={<SessionListPage />} />
            <Route
              path="/sessions/new/:characterId"
              element={<SessionCreatePage />}
            />
            <Route path="/sessions/:id" element={<ChatPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/characters" replace />} />
          </Routes>
        </main>
        <Toaster />
      </div>
    </HashRouter>
  );
}
