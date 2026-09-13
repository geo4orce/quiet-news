// DEV visual trial. Entries match an exact saved day and headline.
// Keep illustration metadata separate from the publication contract.
const illustrations = {
  "2026-09-11": {
    "Houthis take Red Sea island; Saudi pipeline closes": {
      src: "/images/2026-09-11-shipping.jpg",
      alt: "Conceptual drawing of a ship, an island and a closed pipeline valve."
    },
    "Philippine ferry fire death toll reaches 35": {
      src: "/images/2026-09-11-ferry.jpg",
      alt: "A life ring on a quiet dock with a passenger ferry in the distance."
    },
    "Diesel tops $6 as monthly inflation quickens": {
      src: "/images/2026-09-11-fuel.jpg",
      alt: "A fuel pump, coins and a rising line representing higher prices."
    }
  }
};

export function illustrationFor(date, headline) {
  return Object.hasOwn(illustrations, date)
    && Object.hasOwn(illustrations[date], headline)
    ? illustrations[date][headline] : null;
}
