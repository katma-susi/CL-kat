export function getRandomColor() {
  const families = ['Red','Green','Blue','Orange','Yellow','Gray','Violet','Pink','Brown','Black','White'];
  const family = families[Math.floor(Math.random() * families.length)];
  const hex = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
  const realNames = ['100 Mph','Crimson','Scarlet','Sunset','Lime','Ocean','Slate','Violet Dream','Blush','Mocha','Pure'];
  const realName = realNames[Math.floor(Math.random() * realNames.length)];
  return { family, hex, realName };
}
