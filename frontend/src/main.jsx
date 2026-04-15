import React from "react";
import "./index.css";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { BrowserRouter } from "react-router-dom";

ReactDOM.createRoot(document.getElementById("root")).render(
  // The basename ensures all links are relative to your school folder
  <BrowserRouter basename="/cgroup32/ReactProject/dist">
    <App />
  </BrowserRouter>,
);
