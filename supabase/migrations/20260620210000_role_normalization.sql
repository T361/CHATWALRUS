-- =====================================================================
-- Role Normalization Function
-- =====================================================================
-- Maps freeform title/role text to standard categories:
-- Finance, Marketing, Creative, Product, Other

CREATE OR REPLACE FUNCTION normalize_role(title TEXT)
RETURNS TEXT AS $$
BEGIN
  IF title IS NULL THEN
    RETURN 'Other';
  END IF;

  RETURN CASE
    -- Finance
    WHEN title ILIKE '%finance%' OR
         title ILIKE '%accounting%' OR
         title ILIKE '%controller%' OR
         title ILIKE '%treasurer%' OR
         title ILIKE '%audit%' OR
         title ILIKE '%fp&a%' THEN 'Finance'

    -- Marketing
    WHEN title ILIKE '%marketing%' OR
         title ILIKE '%brand%' OR
         title ILIKE '%growth%' OR
         title ILIKE '%demand gen%' OR
         title ILIKE '%seo%' OR
         title ILIKE '%social media%' OR
         title ILIKE '%digital marketing%' THEN 'Marketing'

    -- Creative
    WHEN title ILIKE '%creative%' OR
         title ILIKE '%design%' OR
         title ILIKE '%content%' OR
         title ILIKE '%copywriter%' OR
         title ILIKE '%video%' OR
         title ILIKE '%photo%' OR
         title ILIKE '%graphic%' THEN 'Creative'

    -- Product
    WHEN title ILIKE '%product%' OR
         title ILIKE '%pm%' OR
         title ILIKE '%product manager%' OR
         title ILIKE '%product owner%' THEN 'Product'

    -- Default to Other
    ELSE 'Other'
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Comment
COMMENT ON FUNCTION normalize_role(TEXT) IS 'Normalizes freeform title text into standard role categories: Finance, Marketing, Creative, Product, Other';
