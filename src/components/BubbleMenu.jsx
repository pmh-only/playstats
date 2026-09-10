import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import "./BubbleMenu.css";

const defaultItems = [
  {
    label: "home",
    href: "/",
    ariaLabel: "Home",
    rotation: -6,
    hoverStyles: { bgColor: "#b8ff57", textColor: "#080908" },
  },
];

export default function BubbleMenu({
  logo,
  onMenuClick,
  className,
  style,
  menuAriaLabel = "Toggle menu",
  menuBg = "#fff",
  menuContentColor = "#111",
  useFixedPosition = false,
  items,
  animationEase = "back.out(1.5)",
  animationDuration = 0.5,
  staggerDelay = 0.12,
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const overlayRef = useRef(null);
  const bubblesRef = useRef([]);
  const labelRefs = useRef([]);
  const menuItems = items?.length ? items : defaultItems;
  const containerClassName = [
    "bubble-menu",
    useFixedPosition ? "fixed" : "absolute",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const handleToggle = () => {
    const nextState = !isMenuOpen;
    if (nextState) setShowOverlay(true);
    setIsMenuOpen(nextState);
    onMenuClick?.(nextState);
  };

  useEffect(() => {
    const overlay = overlayRef.current;
    const bubbles = bubblesRef.current.filter(Boolean);
    const labels = labelRefs.current.filter(Boolean);
    if (!overlay || bubbles.length === 0) return undefined;

    if (isMenuOpen) {
      gsap.set(overlay, { display: "flex" });
      gsap.killTweensOf([...bubbles, ...labels]);
      gsap.set(bubbles, { scale: 0, transformOrigin: "50% 50%" });
      gsap.set(labels, { y: 24, autoAlpha: 0 });

      bubbles.forEach((bubble, index) => {
        const delay = index * staggerDelay + gsap.utils.random(-0.05, 0.05);
        const timeline = gsap.timeline({ delay });
        timeline.to(bubble, {
          scale: 1,
          duration: animationDuration,
          ease: animationEase,
        });
        if (labels[index]) {
          timeline.to(
            labels[index],
            {
              y: 0,
              autoAlpha: 1,
              duration: animationDuration,
              ease: "power3.out",
            },
            `-=${animationDuration * 0.9}`,
          );
        }
      });
    } else if (showOverlay) {
      gsap.killTweensOf([...bubbles, ...labels]);
      gsap.to(labels, {
        y: 24,
        autoAlpha: 0,
        duration: 0.2,
        ease: "power3.in",
      });
      gsap.to(bubbles, {
        scale: 0,
        duration: 0.2,
        ease: "power3.in",
        onComplete: () => {
          gsap.set(overlay, { display: "none" });
          setShowOverlay(false);
        },
      });
    }

    return () => gsap.killTweensOf([...bubbles, ...labels]);
  }, [
    isMenuOpen,
    showOverlay,
    animationEase,
    animationDuration,
    staggerDelay,
  ]);

  useEffect(() => {
    const handleResize = () => {
      if (!isMenuOpen) return;
      const isDesktop = window.innerWidth >= 900;
      bubblesRef.current.filter(Boolean).forEach((bubble, index) => {
        gsap.set(bubble, {
          rotation: isDesktop ? (menuItems[index]?.rotation ?? 0) : 0,
        });
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isMenuOpen, menuItems]);

  return (
    <>
      <nav
        className={containerClassName}
        style={style}
        aria-label="Main navigation"
      >
        <div
          className="bubble logo-bubble"
          aria-label="Logo"
          style={{ background: menuBg }}
        >
          <span className="logo-content">
            {typeof logo === "string" ? (
              <img src={logo} alt="Logo" className="bubble-logo" />
            ) : (
              logo
            )}
          </span>
        </div>

        <button
          type="button"
          className={`bubble toggle-bubble menu-btn ${isMenuOpen ? "open" : ""}`}
          onClick={handleToggle}
          aria-label={menuAriaLabel}
          aria-pressed={isMenuOpen}
          style={{ background: menuBg }}
        >
          <span className="menu-line" style={{ background: menuContentColor }} />
          <span
            className="menu-line short"
            style={{ background: menuContentColor }}
          />
        </button>
      </nav>

      {showOverlay && (
        <div
          ref={overlayRef}
          className={`bubble-menu-items ${useFixedPosition ? "fixed" : "absolute"}`}
          aria-hidden={!isMenuOpen}
        >
          <ul className="pill-list" role="menu" aria-label="Menu links">
            {menuItems.map((item, index) => (
              <li key={item.href} role="none" className="pill-col">
                <a
                  role="menuitem"
                  href={item.href}
                  aria-label={item.ariaLabel || item.label}
                  className="pill-link"
                  style={{
                    "--item-rot": `${item.rotation ?? 0}deg`,
                    "--pill-bg": menuBg,
                    "--pill-color": menuContentColor,
                    "--hover-bg": item.hoverStyles?.bgColor || "#f3f4f6",
                    "--hover-color":
                      item.hoverStyles?.textColor || menuContentColor,
                  }}
                  ref={(element) => {
                    if (element) bubblesRef.current[index] = element;
                  }}
                >
                  <span
                    className="pill-label"
                    ref={(element) => {
                      if (element) labelRefs.current[index] = element;
                    }}
                  >
                    {item.label}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
