/**
 * routes.tsx — React Router v6 createBrowserRouter + lazy import (U7a FD §5.1 + U7d §6).
 */
import { lazy } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { RequireAuth } from "./RequireAuth";
import { Layout } from "./Layout";

const HomePage = lazy(() => import("../features/home/HomePage"));
const SplashPage = lazy(() => import("../features/auth/SplashPage"));
const SignInPage = lazy(() => import("../features/auth/SignInPage"));
const CallbackPage = lazy(() => import("../features/auth/CallbackPage"));
const ProfilePage = lazy(() => import("../features/profile/ProfilePage"));
// U7d 追加 routes
const DecisionPage = lazy(() => import("../features/decision/DecisionPage"));
const PersonaListPage = lazy(() => import("../features/persona/PersonaListPage"));
const PersonaSelectionPage = lazy(() => import("../features/persona/PersonaSelectionPage"));
const ScorePage = lazy(() => import("../features/score/ScorePage"));
const PreferencePage = lazy(() => import("../features/preference/PreferencePage"));
// アイデア検証 v3-β: 新規登録時 嗜好把握 onboarding
const OnboardingPage = lazy(() => import("../features/onboarding/OnboardingPage"));
// 2026-05-24: AnonymousPersonaList / AnonymousPersonaDetail (履歴専用画面) 撤去

export const router = createBrowserRouter([
  // 2026-05-24: SplashPage は Layout 外の独立 route. 画面全体に background
  // (cream + earth horizon) を表示するため、Layout header / padding を経由しない.
  { path: "/auth/splash", element: <SplashPage /> },
  {
    path: "/",
    element: <Layout />,
    children: [
      {
        index: true,
        element: (
          <RequireAuth>
            <HomePage />
          </RequireAuth>
        ),
      },
      { path: "auth/signin", element: <SignInPage /> },
      { path: "auth/callback", element: <CallbackPage /> },
      {
        path: "profile",
        element: (
          <RequireAuth>
            <ProfilePage />
          </RequireAuth>
        ),
      },
      {
        path: "decision",
        element: (
          <RequireAuth>
            <DecisionPage />
          </RequireAuth>
        ),
      },
      {
        path: "personas",
        element: (
          <RequireAuth>
            <PersonaListPage />
          </RequireAuth>
        ),
      },
      {
        path: "personas/selection",
        element: (
          <RequireAuth>
            <PersonaSelectionPage />
          </RequireAuth>
        ),
      },
      {
        path: "score",
        element: (
          <RequireAuth>
            <ScorePage />
          </RequireAuth>
        ),
      },
      {
        path: "preferences",
        element: (
          <RequireAuth>
            <PreferencePage />
          </RequireAuth>
        ),
      },
      {
        path: "onboarding",
        element: (
          <RequireAuth>
            <OnboardingPage />
          </RequireAuth>
        ),
      },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
