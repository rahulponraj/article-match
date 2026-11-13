module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: { extend: { colors: { ink: "#14181d", paper: "#f4f5f3", signal: "#d2201a", line: "#d9dcd6", good: "#1f7a4d", warn: "#b4741a" },
    fontFamily: { sans: ["var(--font-sans)", "system-ui", "sans-serif"] } } },
};
