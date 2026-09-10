import BubbleMenu from "./BubbleMenu";

export default function SiteMenu({ homeHref = "/", statsHref = "/all" }) {
  const query = statsHref.includes("?") ? statsHref.slice(statsHref.indexOf("?")) : "";
  const items = [
    {
      label: "albums",
      href: homeHref,
      ariaLabel: "Explore top albums",
      rotation: -4,
      hoverStyles: { bgColor: "#b8ff57", textColor: "#080908" },
    },
    {
      label: "stats",
      href: statsHref,
      ariaLabel: "View all listening statistics",
      rotation: 4,
      hoverStyles: { bgColor: "#b8ff57", textColor: "#080908" },
    },
    {
      label: "songs",
      href: `/top/songs${query}`,
      ariaLabel: "View top songs",
      rotation: 3,
      hoverStyles: { bgColor: "#b8ff57", textColor: "#080908" },
    },
    {
      label: "artists",
      href: `/top/artists${query}`,
      ariaLabel: "View top artists",
      rotation: -3,
      hoverStyles: { bgColor: "#b8ff57", textColor: "#080908" },
    },
    {
      label: "top albums",
      href: `/top/albums${query}`,
      ariaLabel: "View ranked albums",
      rotation: 3,
      hoverStyles: { bgColor: "#b8ff57", textColor: "#080908" },
    },
    {
      label: "sessions",
      href: `/sessions${query}`,
      ariaLabel: "View longest sessions",
      rotation: -3,
      hoverStyles: { bgColor: "#b8ff57", textColor: "#080908" },
    },
  ];

  return (
    <BubbleMenu
      logo={
        <a href={homeHref} className="bubble-wordmark" aria-label="Playstats home">
          PLAY/STATS
        </a>
      }
      items={items}
      menuAriaLabel="Toggle Playstats navigation"
      menuBg="#f4f1e8"
      menuContentColor="#080908"
      useFixedPosition
      animationDuration={0.45}
      staggerDelay={0.1}
    />
  );
}
