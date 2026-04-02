import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface Profile {
  id: string;
  name: string;
  email: string;
}

interface AuthContextType {
  user: Profile | null;
  session: any | null;
  login: (email: string, password: string, rememberMe: boolean) => Promise<boolean>;
  signup: (name: string, email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE = "/api";

const postJson = async (endpoint: string, payload: unknown) => {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  return { response, data };
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<Profile | null>(null);
  const [session, setSession] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Check for existing token on mount
    const token = localStorage.getItem("auth_token");
    const storedUser = localStorage.getItem("auth_user");

    if (token && storedUser) {
      try {
        setUser(JSON.parse(storedUser));
        setSession({ token });
      } catch (e) {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("auth_user");
      }
    }
    setIsLoading(false);
  }, []);

  const signup = async (name: string, email: string, password: string): Promise<boolean> => {
    try {
      const { response, data } = await postJson("/auth/signup", { name, email, password });

      if (!response.ok) {
        toast.error(data.message || "Failed to create account");
        return false;
      }

      if (data.token && data.user) {
        localStorage.setItem("auth_token", data.token);
        localStorage.setItem("auth_user", JSON.stringify(data.user));
        setUser(data.user);
        setSession({ token: data.token });
        toast.success("Account created successfully!");
        navigate("/");
        return true;
      }

      return false;
    } catch (error: any) {
      toast.error(error.message || "Failed to create account");
      return false;
    }
  };

  const login = async (email: string, password: string, _rememberMe: boolean): Promise<boolean> => {
    try {
      const { response, data } = await postJson("/auth/login", { email, password });

      if (!response.ok) {
        toast.error(data.message || "Invalid email or password");
        return false;
      }

      if (data.token && data.user) {
        localStorage.setItem("auth_token", data.token);
        localStorage.setItem("auth_user", JSON.stringify(data.user));
        setUser(data.user);
        setSession({ token: data.token });
        toast.success("Welcome back!");
        navigate("/");
        return true;
      }

      return false;
    } catch (error: any) {
      toast.error(error.message || "Failed to login");
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    setUser(null);
    setSession(null);
    toast.success("Logged out successfully");
    navigate("/login");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        login,
        signup,
        logout,
        isAuthenticated: !!session?.token,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
