export interface DrawTimeDetails {
  [time: string]: string; // e.g., '10H': 'Reveil'
}

export interface DrawSchedule {
  [day: string]: DrawTimeDetails; // e.g., 'Lundi': { '10H': 'Reveil', ... }
}

export const DRAW_SCHEDULE: DrawSchedule = {
  Lundi: { '10H': 'Reveil', '13H': 'Etoile', '16H': 'Akwaba', '18H15': 'Monday Special' },
  Mardi: { '10H': 'La Matinale', '13H': 'Emergence', '16H': 'Sika', '18H15': 'Lucky Tuesday' },
  Mercredi: { '10H': 'Premiere Heure', '13H': 'Fortune', '16H': 'Baraka', '18H15': 'Midweek' },
  Jeudi: { '10H': 'Kado', '13H': 'Privilege', '16H': 'Monni', '18H15': 'Fortune Thursday' },
  Vendredi: { '10H': 'Cash', '13H': 'Solution', '16H': 'Wari', '18H15': 'Friday Bonanza' },
  Samedi: { '10H': 'Soutra', '13H': 'Diamant', '16H': 'Moaye', '18H15': 'National' },
  Dimanche: { '10H': 'Benediction', '13H': 'Prestige', '16H': 'Awale', '18H15': 'Espoir' },
};

// Function to get a flat list of unique draw names (categories)
export function getUniqueDrawNames(): string[] {
  const drawNames = new Set<string>();
  Object.values(DRAW_SCHEDULE).forEach(daySchedule => {
    Object.values(daySchedule).forEach(name => drawNames.add(name));
  });
  return Array.from(drawNames).sort();
}

// Function to create a URL-friendly slug from a draw name
export function slugifyDrawName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

// Function to find a draw name by its slug
export function getDrawNameBySlug(slug: string): string | undefined {
  const allDrawNames = getUniqueDrawNames();
  return allDrawNames.find(name => slugifyDrawName(name) === slug);
}
