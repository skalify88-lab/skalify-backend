package com.amplifyframework.datastore.generated.model;

import com.amplifyframework.core.model.temporal.Temporal;
import com.amplifyframework.core.model.ModelIdentifier;

import java.util.List;
import java.util.UUID;
import java.util.Objects;

import androidx.core.util.ObjectsCompat;

import com.amplifyframework.core.model.AuthStrategy;
import com.amplifyframework.core.model.Model;
import com.amplifyframework.core.model.ModelOperation;
import com.amplifyframework.core.model.annotations.AuthRule;
import com.amplifyframework.core.model.annotations.Index;
import com.amplifyframework.core.model.annotations.ModelConfig;
import com.amplifyframework.core.model.annotations.ModelField;
import com.amplifyframework.core.model.query.predicate.QueryField;

import static com.amplifyframework.core.model.query.predicate.QueryField.field;

/** This is an auto generated class representing the Article type in your schema. */
@SuppressWarnings("all")
@ModelConfig(pluralName = "Articles", type = Model.Type.USER, version = 1, authRules = {
  @AuthRule(allow = AuthStrategy.PUBLIC, provider = "identityPool", operations = { ModelOperation.READ }),
  @AuthRule(allow = AuthStrategy.PRIVATE, operations = { ModelOperation.READ }),
  @AuthRule(allow = AuthStrategy.OWNER, ownerField = "owner", identityClaim = "cognito:username", provider = "userPools", operations = { ModelOperation.CREATE, ModelOperation.UPDATE, ModelOperation.DELETE, ModelOperation.READ })
}, hasLazySupport = true)
public final class Article implements Model {
  public static final ArticlePath rootPath = new ArticlePath("root", false, null);
  public static final QueryField ID = field("Article", "id");
  public static final QueryField ARTICLE_NAME = field("Article", "articleName");
  public static final QueryField DESCRIPTION = field("Article", "description");
  public static final QueryField ENTERPRISE_NAME = field("Article", "enterpriseName");
  public static final QueryField IMAGE_URL = field("Article", "imageUrl");
  public static final QueryField USER_ID = field("Article", "userId");
  public static final QueryField ARTICLE_PRICE = field("Article", "articlePrice");
  public static final QueryField CREATED_AT = field("Article", "createdAt");
  private final @ModelField(targetType="ID", isRequired = true) String id;
  private final @ModelField(targetType="String", isRequired = true) String articleName;
  private final @ModelField(targetType="String", isRequired = true) String description;
  private final @ModelField(targetType="String", isRequired = true) String enterpriseName;
  private final @ModelField(targetType="String", isRequired = true) String imageUrl;
  private final @ModelField(targetType="String", isRequired = true) String userId;
  private final @ModelField(targetType="String", isRequired = true) String articlePrice;
  private final @ModelField(targetType="AWSDateTime") Temporal.DateTime createdAt;
  private @ModelField(targetType="AWSDateTime", isReadOnly = true) Temporal.DateTime updatedAt;
  /** @deprecated This API is internal to Amplify and should not be used. */
  @Deprecated
   public String resolveIdentifier() {
    return id;
  }
  
  public String getId() {
      return id;
  }
  
  public String getArticleName() {
      return articleName;
  }
  
  public String getDescription() {
      return description;
  }
  
  public String getEnterpriseName() {
      return enterpriseName;
  }
  
  public String getImageUrl() {
      return imageUrl;
  }
  
  public String getUserId() {
      return userId;
  }
  
  public String getArticlePrice() {
      return articlePrice;
  }
  
  public Temporal.DateTime getCreatedAt() {
      return createdAt;
  }
  
  public Temporal.DateTime getUpdatedAt() {
      return updatedAt;
  }
  
  private Article(String id, String articleName, String description, String enterpriseName, String imageUrl, String userId, String articlePrice, Temporal.DateTime createdAt) {
    this.id = id;
    this.articleName = articleName;
    this.description = description;
    this.enterpriseName = enterpriseName;
    this.imageUrl = imageUrl;
    this.userId = userId;
    this.articlePrice = articlePrice;
    this.createdAt = createdAt;
  }
  
  @Override
   public boolean equals(Object obj) {
      if (this == obj) {
        return true;
      } else if(obj == null || getClass() != obj.getClass()) {
        return false;
      } else {
      Article article = (Article) obj;
      return ObjectsCompat.equals(getId(), article.getId()) &&
              ObjectsCompat.equals(getArticleName(), article.getArticleName()) &&
              ObjectsCompat.equals(getDescription(), article.getDescription()) &&
              ObjectsCompat.equals(getEnterpriseName(), article.getEnterpriseName()) &&
              ObjectsCompat.equals(getImageUrl(), article.getImageUrl()) &&
              ObjectsCompat.equals(getUserId(), article.getUserId()) &&
              ObjectsCompat.equals(getArticlePrice(), article.getArticlePrice()) &&
              ObjectsCompat.equals(getCreatedAt(), article.getCreatedAt()) &&
              ObjectsCompat.equals(getUpdatedAt(), article.getUpdatedAt());
      }
  }
  
  @Override
   public int hashCode() {
    return new StringBuilder()
      .append(getId())
      .append(getArticleName())
      .append(getDescription())
      .append(getEnterpriseName())
      .append(getImageUrl())
      .append(getUserId())
      .append(getArticlePrice())
      .append(getCreatedAt())
      .append(getUpdatedAt())
      .toString()
      .hashCode();
  }
  
  @Override
   public String toString() {
    return new StringBuilder()
      .append("Article {")
      .append("id=" + String.valueOf(getId()) + ", ")
      .append("articleName=" + String.valueOf(getArticleName()) + ", ")
      .append("description=" + String.valueOf(getDescription()) + ", ")
      .append("enterpriseName=" + String.valueOf(getEnterpriseName()) + ", ")
      .append("imageUrl=" + String.valueOf(getImageUrl()) + ", ")
      .append("userId=" + String.valueOf(getUserId()) + ", ")
      .append("articlePrice=" + String.valueOf(getArticlePrice()) + ", ")
      .append("createdAt=" + String.valueOf(getCreatedAt()) + ", ")
      .append("updatedAt=" + String.valueOf(getUpdatedAt()))
      .append("}")
      .toString();
  }
  
  public static ArticleNameStep builder() {
      return new Builder();
  }
  
  /**
   * WARNING: This method should not be used to build an instance of this object for a CREATE mutation.
   * This is a convenience method to return an instance of the object with only its ID populated
   * to be used in the context of a parameter in a delete mutation or referencing a foreign key
   * in a relationship.
   * @param id the id of the existing item this instance will represent
   * @return an instance of this model with only ID populated
   */
  public static Article justId(String id) {
    return new Article(
      id,
      null,
      null,
      null,
      null,
      null,
      null,
      null
    );
  }
  
  public CopyOfBuilder copyOfBuilder() {
    return new CopyOfBuilder(id,
      articleName,
      description,
      enterpriseName,
      imageUrl,
      userId,
      articlePrice,
      createdAt);
  }
  public interface ArticleNameStep {
    DescriptionStep articleName(String articleName);
  }
  

  public interface DescriptionStep {
    EnterpriseNameStep description(String description);
  }
  

  public interface EnterpriseNameStep {
    ImageUrlStep enterpriseName(String enterpriseName);
  }
  

  public interface ImageUrlStep {
    UserIdStep imageUrl(String imageUrl);
  }
  

  public interface UserIdStep {
    ArticlePriceStep userId(String userId);
  }
  

  public interface ArticlePriceStep {
    BuildStep articlePrice(String articlePrice);
  }
  

  public interface BuildStep {
    Article build();
    BuildStep id(String id);
    BuildStep createdAt(Temporal.DateTime createdAt);
  }
  

  public static class Builder implements ArticleNameStep, DescriptionStep, EnterpriseNameStep, ImageUrlStep, UserIdStep, ArticlePriceStep, BuildStep {
    private String id;
    private String articleName;
    private String description;
    private String enterpriseName;
    private String imageUrl;
    private String userId;
    private String articlePrice;
    private Temporal.DateTime createdAt;
    public Builder() {
      
    }
    
    private Builder(String id, String articleName, String description, String enterpriseName, String imageUrl, String userId, String articlePrice, Temporal.DateTime createdAt) {
      this.id = id;
      this.articleName = articleName;
      this.description = description;
      this.enterpriseName = enterpriseName;
      this.imageUrl = imageUrl;
      this.userId = userId;
      this.articlePrice = articlePrice;
      this.createdAt = createdAt;
    }
    
    @Override
     public Article build() {
        String id = this.id != null ? this.id : UUID.randomUUID().toString();
        
        return new Article(
          id,
          articleName,
          description,
          enterpriseName,
          imageUrl,
          userId,
          articlePrice,
          createdAt);
    }
    
    @Override
     public DescriptionStep articleName(String articleName) {
        Objects.requireNonNull(articleName);
        this.articleName = articleName;
        return this;
    }
    
    @Override
     public EnterpriseNameStep description(String description) {
        Objects.requireNonNull(description);
        this.description = description;
        return this;
    }
    
    @Override
     public ImageUrlStep enterpriseName(String enterpriseName) {
        Objects.requireNonNull(enterpriseName);
        this.enterpriseName = enterpriseName;
        return this;
    }
    
    @Override
     public UserIdStep imageUrl(String imageUrl) {
        Objects.requireNonNull(imageUrl);
        this.imageUrl = imageUrl;
        return this;
    }
    
    @Override
     public ArticlePriceStep userId(String userId) {
        Objects.requireNonNull(userId);
        this.userId = userId;
        return this;
    }
    
    @Override
     public BuildStep articlePrice(String articlePrice) {
        Objects.requireNonNull(articlePrice);
        this.articlePrice = articlePrice;
        return this;
    }
    
    @Override
     public BuildStep createdAt(Temporal.DateTime createdAt) {
        this.createdAt = createdAt;
        return this;
    }
    
    /**
     * @param id id
     * @return Current Builder instance, for fluent method chaining
     */
    public BuildStep id(String id) {
        this.id = id;
        return this;
    }
  }
  

  public final class CopyOfBuilder extends Builder {
    private CopyOfBuilder(String id, String articleName, String description, String enterpriseName, String imageUrl, String userId, String articlePrice, Temporal.DateTime createdAt) {
      super(id, articleName, description, enterpriseName, imageUrl, userId, articlePrice, createdAt);
      Objects.requireNonNull(articleName);
      Objects.requireNonNull(description);
      Objects.requireNonNull(enterpriseName);
      Objects.requireNonNull(imageUrl);
      Objects.requireNonNull(userId);
      Objects.requireNonNull(articlePrice);
    }
    
    @Override
     public CopyOfBuilder articleName(String articleName) {
      return (CopyOfBuilder) super.articleName(articleName);
    }
    
    @Override
     public CopyOfBuilder description(String description) {
      return (CopyOfBuilder) super.description(description);
    }
    
    @Override
     public CopyOfBuilder enterpriseName(String enterpriseName) {
      return (CopyOfBuilder) super.enterpriseName(enterpriseName);
    }
    
    @Override
     public CopyOfBuilder imageUrl(String imageUrl) {
      return (CopyOfBuilder) super.imageUrl(imageUrl);
    }
    
    @Override
     public CopyOfBuilder userId(String userId) {
      return (CopyOfBuilder) super.userId(userId);
    }
    
    @Override
     public CopyOfBuilder articlePrice(String articlePrice) {
      return (CopyOfBuilder) super.articlePrice(articlePrice);
    }
    
    @Override
     public CopyOfBuilder createdAt(Temporal.DateTime createdAt) {
      return (CopyOfBuilder) super.createdAt(createdAt);
    }
  }
  

  public static class ArticleIdentifier extends ModelIdentifier<Article> {
    private static final long serialVersionUID = 1L;
    public ArticleIdentifier(String id) {
      super(id);
    }
  }
  
}
