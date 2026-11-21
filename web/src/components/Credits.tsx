/** The maker's block. A name and three links, with a plain label. */
export default function Credits() {
  return (
    <div className="credits">
      <span className="credits-label mono">Creator</span>
      <a
        className="credits-name"
        href="https://github.com/Mutawakkil-Yusuf"
        target="_blank"
        rel="noreferrer"
      >
        Mutawakkil
      </a>
      <div className="credits-links mono">
        <a href="https://instagram.com/itsmutawakkil" target="_blank" rel="noreferrer">Instagram</a>
        <a href="https://x.com/itsmutawakkil" target="_blank" rel="noreferrer">X</a>
        <a href="https://github.com/Mutawakkil-Yusuf" target="_blank" rel="noreferrer">GitHub</a>
      </div>
    </div>
  );
}
