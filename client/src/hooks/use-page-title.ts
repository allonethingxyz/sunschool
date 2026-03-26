import { useEffect } from 'react';
import { useLocation } from 'wouter';

const BASE_TITLE = 'Sunschool';

const PAGE_TITLES: Record<string, string> = {
  '/': BASE_TITLE,
  '/welcome': `Welcome — ${BASE_TITLE}`,
  '/auth': `Sign In — ${BASE_TITLE}`,
  '/privacy': `Privacy Policy — ${BASE_TITLE}`,
  '/terms': `Terms of Service — ${BASE_TITLE}`,
  '/dashboard': `Parent Dashboard — ${BASE_TITLE}`,
  '/learners': `My Learners — ${BASE_TITLE}`,
  '/add-learner': `Add Learner — ${BASE_TITLE}`,
  '/reports': `Reports — ${BASE_TITLE}`,
  '/rewards': `Rewards — ${BASE_TITLE}`,
  '/database-sync': `Database Sync — ${BASE_TITLE}`,
  '/admin': `Admin — ${BASE_TITLE}`,
  '/admin/users': `Users — Admin — ${BASE_TITLE}`,
  '/admin/lessons': `Lessons — Admin — ${BASE_TITLE}`,
  '/admin/settings': `Settings — Admin — ${BASE_TITLE}`,
  '/learner': `Home — ${BASE_TITLE}`,
  '/select-learner': `Select Learner — ${BASE_TITLE}`,
  '/lessons': `Lessons — ${BASE_TITLE}`,
  '/lesson': `Lesson — ${BASE_TITLE}`,
  '/progress': `Progress — ${BASE_TITLE}`,
  '/goals': `Goals — ${BASE_TITLE}`,
};

export function usePageTitle() {
  const [location] = useLocation();

  useEffect(() => {
    // Exact match first
    if (PAGE_TITLES[location]) {
      document.title = PAGE_TITLES[location];
      return;
    }

    // Pattern matches
    if (location.startsWith('/quiz/')) {
      document.title = `Quiz — ${BASE_TITLE}`;
      return;
    }
    if (location.startsWith('/change-learner-subjects/')) {
      document.title = `Subjects — ${BASE_TITLE}`;
      return;
    }
    if (location.startsWith('/admin')) {
      document.title = `Admin — ${BASE_TITLE}`;
      return;
    }

    document.title = BASE_TITLE;
  }, [location]);
}
