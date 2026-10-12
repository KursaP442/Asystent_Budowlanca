update storage.buckets set allowed_mime_types=array['image/jpeg','image/png','image/webp','application/pdf']
  where id='project-scans';
