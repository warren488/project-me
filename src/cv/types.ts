// Shape of one rendered CV page, as written to cv/published.json by cv/publish.js.
export interface Education {
  degree: string;
  uni: string;
  dates: string;
  details?: string;
}

export interface Achievement {
  role: string;
  org: string;
  note?: string;
}

export interface Experience {
  title: string;
  company: string;
  dates: string;
  details: string[]; // specific items can contain HTML strings like <strong>
}

export interface Project {
  title: string;
  desc: string;
  tech: string;
}

export interface Interest {
  name: string;
  desc: string;
}

export interface CVPage {
  profile: {
    name: string;
    title: string;
    email: string;
    website: string;
    summary?: string;
  };
  education?: Education[];
  competencies?: string[];
  interests?: Interest[];
  achievements?: Achievement[];
  skills?: Record<string, string[]>;
  experience?: Experience[];
  projects?: Project[];
}

export interface PublishedCV {
  variant: string;
  pages: CVPage[];
}
