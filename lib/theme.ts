export const THEME_STORAGE_KEY = "pandabyte-theme";

export const themeInitScript = `(()=>{var theme;try{var stored=localStorage.getItem("pandabyte-theme");if(stored==="light"||stored==="dark")theme=stored}catch{}if(!theme){try{theme=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}catch{theme="light"}}var root=document.documentElement;root.setAttribute("data-theme",theme);root.style.colorScheme=theme})()`;
